const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// =====================
// CARREGAR DADOS DE TÍTULOS
// =====================
let dadosMercado = null;

function carregarDadosMercado() {
  try {
    // Tenta carregar do mesmo diretório
    const caminhos = [
      path.join(__dirname, 'template_dados_mercado_expandido.json'),
      path.join(__dirname, '..', 'template_dados_mercado_expandido.json'),
      '/home/claude/template_dados_mercado_expandido.json'
    ];

    for (const caminho of caminhos) {
      if (fs.existsSync(caminho)) {
        const conteudo = fs.readFileSync(caminho, 'utf8');
        dadosMercado = JSON.parse(conteudo);
        console.log(`✅ Dados de mercado carregados de: ${caminho}`);
        console.log(`📅 Data: ${dadosMercado.dataAtualizacao}`);
        return true;
      }
    }

    console.warn('⚠️  Arquivo de dados não encontrado. Criando dados padrão...');
    return false;
  } catch (err) {
    console.error('❌ Erro ao carregar dados:', err.message);
    return false;
  }
}

// Carregar dados na inicialização
carregarDadosMercado();

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static('public'));

// =====================
// CONFIGURAÇÃO EMAIL
// =====================

// Modo TESTE: Usa nodemailer em modo test (não envia de verdade)
let transporter;

if (process.env.NODE_ENV === 'production') {
  // PRODUÇÃO: Usa credenciais reais do Titan
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: true, // SSL/TLS
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
} else {
  // TESTE: Modo mock (não envia email de verdade)
  console.log('🧪 MODO TESTE: Emails serão simulados');
  transporter = nodemailer.createTestAccount().then(testAccount => {
    return nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass
      }
    });
  }).catch(err => {
    console.log('⚠️  Usando modo preview (não envia)');
    // Fallback: usar modo preview
    return {
      sendMail: (options, cb) => {
        console.log('📧 [TESTE] Email simulado:');
        console.log(`  Para: ${options.to}`);
        console.log(`  Assunto: ${options.subject}`);
        console.log(`  Anexo: ${options.attachments ? 'PDF incluído' : 'Sem anexos'}`);
        cb(null, { messageId: 'test-' + Date.now() });
      }
    };
  });
}

// =====================
// FUNÇÕES AUXILIARES
// =====================

// Gerar PDF da carteira
function generatePDF(allocationData) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const buffers = [];

      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => {
        resolve(Buffer.concat(buffers));
      });
      doc.on('error', reject);

      // Header
      doc.fontSize(24).font('Helvetica-Bold').text('allocations.me', { align: 'center' });
      doc.fontSize(12).font('Helvetica').text('Sua IA para Balanceamento de Carteira', { align: 'center' });
      doc.moveDown();
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown();

      // Data
      const today = new Date().toLocaleDateString('pt-BR');
      doc.fontSize(11).font('Helvetica').text(`Data: ${today}`, { align: 'right' });
      doc.moveDown();

      // Perfil do Usuário
      doc.fontSize(14).font('Helvetica-Bold').text('Seu Perfil');
      doc.fontSize(11).font('Helvetica');
      doc.text(`Idade: ${allocationData.age} anos`);
      doc.text(`Horizonte: ${allocationData.horizon}`);
      doc.text(`Tolerância ao Risco: ${allocationData.risk}`);
      doc.text(`Situação Financeira: ${allocationData.situation}`);
      doc.text(`Experiência: ${allocationData.experience}`);
      doc.text(`Valor Inicial: R$ ${parseInt(allocationData.initial).toLocaleString('pt-BR')}`);
      doc.text(`Aporte Anual: R$ ${parseInt(allocationData.annual).toLocaleString('pt-BR')}`);
      doc.moveDown();

      // Alocação
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown();
      doc.fontSize(14).font('Helvetica-Bold').text('Sua Alocação de Investimentos');
      doc.fontSize(11).font('Helvetica');
      doc.moveDown();

      // Tabela de alocação
      const allocations = [
        { asset: 'SELIC (LFT, CDB, LCA)', percentage: 73 },
        { asset: 'IPCA (NTN-B)', percentage: 16 },
        { asset: 'Pré-fixado (LTN, CDB)', percentage: 11 }
      ];

      allocations.forEach(alloc => {
        const barWidth = (alloc.percentage / 100) * 300;
        
        // Nome + percentual
        doc.fontSize(11).font('Helvetica-Bold').text(alloc.asset);
        
        // Barra de progresso visual
        doc.rect(50, doc.y + 5, 300, 20).stroke();
        doc.rect(50, doc.y + 5, barWidth, 20).fill('#667eea').stroke('#667eea');
        doc.fontSize(10).font('Helvetica-Bold').fillColor('white').text(`${alloc.percentage}%`, 60, doc.y + 7, { width: 280 });
        
        doc.fillColor('black');
        doc.moveDown(1.5);
      });

      doc.moveDown();

      // Footer com disclaimer
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown();
      doc.fontSize(9).font('Helvetica').fillColor('#666').text(
        'AVISO IMPORTANTE: Esta alocação não substitui um assessor financeiro profissional. Consulte sempre um especialista antes de investir.',
        { align: 'justify' }
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// Mapear respostas para nomes legíveis
function mapAnswers(answers) {
  const riskMap = {
    'low': 'Baixo (Conservador)',
    'medium': 'Médio (Moderado)',
    'high': 'Alto (Agressivo)'
  };

  const situationMap = {
    'employed': 'Empregado',
    'self-employed': 'Autônomo',
    'retired': 'Aposentado',
    'unemployed': 'Desempregado'
  };

  const experienceMap = {
    'beginner': 'Iniciante',
    'intermediate': 'Intermediário',
    'advanced': 'Experiente'
  };

  return {
    age: answers.age,
    horizon: answers.horizon,
    risk: riskMap[answers.riskProfile] || answers.risk,
    situation: situationMap[answers.situationProfile] || answers.situation,
    experience: experienceMap[answers.experienceProfile] || answers.experience,
    initial: answers.initial,
    annual: answers.annual,
    goal: answers.goal
  };
}

// =====================
// ROTAS
// =====================

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: '✅ Server is running', 
    mode: process.env.NODE_ENV || 'test',
    dadosMercado: dadosMercado ? '✅ Carregado' : '⚠️  Não carregado'
  });
});

// =====================
// ROTAS DE TÍTULOS
// =====================

// GET /api/titulos - Retorna TODOS os dados de títulos
app.get('/api/titulos', (req, res) => {
  if (!dadosMercado) {
    return res.status(503).json({ 
      error: 'Dados de mercado não carregados',
      message: 'Tente novamente em alguns segundos'
    });
  }

  res.json({
    sucesso: true,
    data: dadosMercado,
    timestamp: new Date().toISOString()
  });
});

// GET /api/titulos/resumo - Retorna resumo dos indicadores
app.get('/api/titulos/resumo', (req, res) => {
  if (!dadosMercado) {
    return res.status(503).json({ error: 'Dados não carregados' });
  }

  res.json({
    sucesso: true,
    data: {
      dataAtualizacao: dadosMercado.dataAtualizacao,
      selic: dadosMercado.selic,
      cdi: dadosMercado.cdi,
      ipca_estimado: dadosMercado.ipca_estimado,
      timestamp: new Date().toISOString()
    }
  });
});

// GET /api/titulos/tesouro - Retorna apenas Tesouro
app.get('/api/titulos/tesouro', (req, res) => {
  if (!dadosMercado) {
    return res.status(503).json({ error: 'Dados não carregados' });
  }

  res.json({
    sucesso: true,
    data: dadosMercado.tesouro,
    dataAtualizacao: dadosMercado.dataAtualizacao
  });
});

// GET /api/titulos/cdb - Retorna CDB (pré e pós)
app.get('/api/titulos/cdb', (req, res) => {
  if (!dadosMercado) {
    return res.status(503).json({ error: 'Dados não carregados' });
  }

  res.json({
    sucesso: true,
    data: {
      prefixado: dadosMercado.cdb_prefixado,
      posfixado: dadosMercado.cdb_posfixado
    },
    dataAtualizacao: dadosMercado.dataAtualizacao
  });
});

// GET /api/titulos/lca-lci - Retorna LCA/LCI
app.get('/api/titulos/lca-lci', (req, res) => {
  if (!dadosMercado) {
    return res.status(503).json({ error: 'Dados não carregados' });
  }

  res.json({
    sucesso: true,
    data: dadosMercado.lca_lci,
    dataAtualizacao: dadosMercado.dataAtualizacao
  });
});

// GET /api/titulos/etfs - Retorna ETFs USD
app.get('/api/titulos/etfs', (req, res) => {
  if (!dadosMercado) {
    return res.status(503).json({ error: 'Dados não carregados' });
  }

  res.json({
    sucesso: true,
    data: dadosMercado.etfs_usd,
    dataAtualizacao: dadosMercado.dataAtualizacao
  });
});

// GET /api/titulos/cripto - Retorna Bitcoin e Ethereum
app.get('/api/titulos/cripto', (req, res) => {
  if (!dadosMercado) {
    return res.status(503).json({ error: 'Dados não carregados' });
  }

  res.json({
    sucesso: true,
    data: {
      bitcoin: dadosMercado.bitcoin,
      ethereum: dadosMercado.ethereum
    },
    dataAtualizacao: dadosMercado.dataAtualizacao
  });
});

// GET /api/titulos/ouro - Retorna Ouro
app.get('/api/titulos/ouro', (req, res) => {
  if (!dadosMercado) {
    return res.status(503).json({ error: 'Dados não carregados' });
  }

  res.json({
    sucesso: true,
    data: dadosMercado.ouro,
    dataAtualizacao: dadosMercado.dataAtualizacao
  });
});

// Processar pagamento e enviar email
app.post('/api/process-payment', async (req, res) => {
  try {
    const { email, answers, paymentMethod } = req.body;

    console.log('\n📋 Recebido:');
    console.log(`  Email: ${email}`);
    console.log(`  Método: ${paymentMethod}`);
    console.log(`  Answers:`, answers);

    // Validar email
    if (!email || !email.includes('@')) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email inválido' 
      });
    }

    // Simular processamento de pagamento
    console.log('\n💳 Processando pagamento...');
    // Em produção, aqui integraria com Stripe
    const paymentId = 'test_' + Date.now();
    console.log(`✅ Pagamento simulado: ${paymentId}`);

    // Mapear respostas
    const mappedAnswers = mapAnswers(answers);

    // Gerar PDF
    console.log('\n📄 Gerando PDF...');
    const pdfBuffer = await generatePDF(mappedAnswers);
    console.log('✅ PDF gerado com sucesso');

    // Enviar email
    console.log('\n📧 Enviando email...');
    
    // Aguardar transporter se for Promise (modo test com ethereal)
    const actualTransporter = await Promise.resolve(transporter);

    const mailOptions = {
      from: 'IA@allocations.me',
      to: email,
      subject: '🎯 Sua Alocação de Investimentos - allocations.me',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1a1a1a;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="background: linear-gradient(135deg, #667eea, #764ba2); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin: 0;">allocations.me</h1>
            <p style="color: #666; margin: 10px 0 0 0;">Sua IA para Balanceamento de Carteira</p>
          </div>

          <div style="border-left: 3px solid #667eea; padding: 20px; background: #f8f9ff; margin-bottom: 20px; border-radius: 4px;">
            <h2 style="margin-top: 0; color: #667eea;">Sua Alocação está Pronta! 🎯</h2>
            <p style="color: #666; line-height: 1.6;">
              Parabéns! Sua carteira personalizada foi criada com base em seu perfil, objetivos e tolerância ao risco.
            </p>
          </div>

          <div style="background: #f8f9ff; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h3 style="margin-top: 0; color: #1a1a1a;">Seu Perfil:</h3>
            <ul style="list-style: none; padding: 0; margin: 0; color: #666;">
              <li style="padding: 8px 0;"><strong>Idade:</strong> ${mappedAnswers.age} anos</li>
              <li style="padding: 8px 0;"><strong>Horizonte:</strong> ${mappedAnswers.horizon}</li>
              <li style="padding: 8px 0;"><strong>Risco:</strong> ${mappedAnswers.risk}</li>
              <li style="padding: 8px 0;"><strong>Valor Inicial:</strong> R$ ${parseInt(mappedAnswers.initial).toLocaleString('pt-BR')}</li>
            </ul>
          </div>

          <div style="background: white; border: 1px solid #e5e5e5; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h3 style="margin-top: 0; color: #1a1a1a;">Alocação Recomendada:</h3>
            <div style="padding: 12px; background: #f8f9ff; border-left: 3px solid #667eea; margin-bottom: 12px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                <strong>SELIC (Renda Fixa)</strong>
                <strong style="color: #667eea;">73%</strong>
              </div>
              <div style="background: white; height: 8px; border-radius: 4px; overflow: hidden;">
                <div style="width: 73%; height: 100%; background: linear-gradient(90deg, #667eea, #764ba2);"></div>
              </div>
            </div>
            <div style="padding: 12px; background: #f8f9ff; border-left: 3px solid #667eea; margin-bottom: 12px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                <strong>IPCA (Inflação)</strong>
                <strong style="color: #667eea;">16%</strong>
              </div>
              <div style="background: white; height: 8px; border-radius: 4px; overflow: hidden;">
                <div style="width: 16%; height: 100%; background: linear-gradient(90deg, #667eea, #764ba2);"></div>
              </div>
            </div>
            <div style="padding: 12px; background: #f8f9ff; border-left: 3px solid #667eea;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                <strong>Pré-fixado (Crescimento)</strong>
                <strong style="color: #667eea;">11%</strong>
              </div>
              <div style="background: white; height: 8px; border-radius: 4px; overflow: hidden;">
                <div style="width: 11%; height: 100%; background: linear-gradient(90deg, #667eea, #764ba2);"></div>
              </div>
            </div>
          </div>

          <div style="text-align: center; margin-bottom: 20px;">
            <p style="color: #999; font-size: 14px;">Seu relatório completo em PDF está anexado a este email.</p>
          </div>

          <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; border: 1px solid #e5e5e5; margin-bottom: 20px;">
            <p style="margin: 0; color: #999; font-size: 12px; line-height: 1.6;">
              ⚠️ <strong>AVISO IMPORTANTE:</strong> Esta alocação não substitui um assessor financeiro profissional. Consulte sempre um especialista antes de investir. Os dados históricos e projeções não garantem resultados futuros.
            </p>
          </div>

          <div style="text-align: center; color: #999; font-size: 12px; border-top: 1px solid #e5e5e5; padding-top: 20px;">
            <p>© 2026 allocations.me - Balanceamento de Carteira com IA<br>Todos os direitos reservados</p>
          </div>
        </div>
      `,
      attachments: [
        {
          filename: 'Alocacao_Investimentos_allocations.me.pdf',
          content: pdfBuffer,
          contentType: 'application/pdf'
        }
      ]
    };

    const info = await actualTransporter.sendMail(mailOptions);
    
    if (process.env.NODE_ENV === 'production') {
      console.log('✅ Email enviado! Message ID:', info.messageId);
    } else {
      console.log('✅ Email simulado com sucesso!');
      if (info.messageId) {
        console.log('📧 Preview: https://ethereal.email/message/' + info.messageId);
      }
    }

    // Resposta sucesso
    res.json({
      success: true,
      message: 'Pagamento processado e email enviado!',
      paymentId: paymentId,
      previewUrl: process.env.NODE_ENV !== 'production' && info.messageId ? 
        `https://ethereal.email/message/${info.messageId}` : null
    });

  } catch (error) {
    console.error('❌ Erro:', error.message);
    res.status(500).json({
      success: false,
      message: 'Erro ao processar pagamento: ' + error.message
    });
  }
});

// =====================
// INICIAR SERVER
// =====================

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   allocations.me - Backend Server      ║
╠════════════════════════════════════════╣
║ 🚀 Server rodando em:                  ║
║    http://localhost:${PORT}                   ║
║                                        ║
║ 📧 Modo: ${process.env.NODE_ENV === 'production' ? 'PRODUÇÃO' : 'TESTE (Mock)     '}  ║
║                                        ║
║ 📡 ROTAS DISPONÍVEIS:                  ║
║                                        ║
║ Pagamentos:                            ║
║   POST  /api/process-payment           ║
║                                        ║
║ Títulos (Dados de Mercado):            ║
║   GET   /api/titulos                   ║
║   GET   /api/titulos/resumo            ║
║   GET   /api/titulos/tesouro           ║
║   GET   /api/titulos/cdb               ║
║   GET   /api/titulos/lca-lci           ║
║   GET   /api/titulos/etfs              ║
║   GET   /api/titulos/cripto            ║
║   GET   /api/titulos/ouro              ║
║                                        ║
╚════════════════════════════════════════╝
  `);
});
