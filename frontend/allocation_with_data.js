/**
 * PARTE B: Integração de Dados Reais na Alocação
 * 
 * Este código substitui o método generateAllocation() no allocations_me.html
 * com uma versão que busca dados reais do backend e distribui em 3-5 ativos
 */

// Método melhorado: busca dados do backend e gera alocação com ativos reais
generateAllocationWithData() {
  const self = this;
  
  // Busca todos os dados de títulos
  fetch('http://localhost:3000/api/titulos')
    .then(res => res.json())
    .then(data => {
      if (!data.sucesso) throw new Error('Dados não carregados');
      
      const mercado = data.data;
      const respostas = this.answers;
      
      // Extrai informações do usuário
      const valor = parseInt(respostas.initial) || 10000;
      const aporte = parseInt(respostas.annual) || 0;
      const horizonte = this.extrairHorizonte(respostas.horizon);
      const risco = this.mapRisk(respostas.risk);
      const meta = respostas.goal;
      
      // Determina alocação por categoria (percentuais)
      let alocacao = this.calcularAlocacao(horizonte, valor, risco, meta);
      
      // Seleciona ativos específicos para cada categoria
      const ativos = this.selecionarAtivos(alocacao, mercado, horizonte);
      
      // Exibe resultado
      this.exibirResultado(ativos, mercado);
    })
    .catch(err => {
      console.error('Erro ao carregar dados:', err);
      // Fallback: usa alocação padrão
      this.generateAllocation();
    });
},

// =====================
// HELPERS para Alocação com Dados
// =====================

extrairHorizonte(texto) {
  const match = texto.match(/(\d+)\s*ano/i);
  return match ? parseInt(match[1]) : 5;
},

mapRisk(texto) {
  texto = texto.toLowerCase();
  if (/assustado|nervoso|pavor|pânico|perco sono|preocupado/.test(texto)) return 'low';
  if (/tranquilo.*mas|um pouco|normal|fico atento/.test(texto)) return 'medium';
  if (/durmo tranquilo|oportunidade|compro mais|indiferente|calmo|empolgado/.test(texto)) return 'high';
  return 'medium';
},

calcularAlocacao(horizonte, valor, risco, meta) {
  // Lógica: ajusta alocação conforme horizonte, risco e meta
  
  // Base: conservador
  if (risco === 'low' || horizonte < 2) {
    return {
      selic: 70,      // CDB + LFT
      ipca: 20,       // NTN-B
      pre: 10,        // LTN
      usd: 0,
      btc: 0
    };
  }
  
  // Moderado
  if (risco === 'medium' && horizonte >= 2 && horizonte < 5) {
    return {
      selic: 50,
      ipca: 25,
      pre: 15,
      usd: 10,
      btc: 0
    };
  }
  
  // Agressivo
  return {
    selic: 35,
    ipca: 20,
    pre: 10,
    usd: 25,
    btc: 10
  };
},

selecionarAtivos(alocacao, mercado, horizonte) {
  const ativos = [];
  
  // SELIC: CDB + LFT (3-5 ativos)
  if (alocacao.selic > 0) {
    const selicAtivos = [];
    
    // Add LFT
    selicAtivos.push({
      ativo: 'LFT (100% SELIC)',
      classe: 'SELIC/Pós-fixado',
      taxa: `${mercado.selic}%`,
      tipo: 'Tesouro',
      pct: Math.round(alocacao.selic * 0.3)
    });
    
    // Add CDB (seleciona 2-3 com taxas mais altas)
    const cdbOrdenado = mercado.cdb_prefixado.sort((a, b) => b.taxa - a.taxa);
    for (let i = 0; i < Math.min(2, cdbOrdenado.length); i++) {
      selicAtivos.push({
        ativo: `CDB ${cdbOrdenado[i].banco} (${cdbOrdenado[i].prazo})`,
        classe: 'SELIC/Pós-fixado',
        taxa: `${cdbOrdenado[i].taxa}%`,
        tipo: 'Banco',
        pct: Math.round(alocacao.selic * 0.35)
      });
    }
    
    // Distribui de forma proporcional
    const total = selicAtivos.reduce((sum, a) => sum + a.pct, 0);
    selicAtivos.forEach(a => a.pct = Math.round(a.pct * alocacao.selic / total));
    
    ativos.push(...selicAtivos);
  }
  
  // IPCA: NTN-B (3-5 ativos)
  if (alocacao.ipca > 0) {
    const ipcaAtivos = [];
    
    // Seleciona 3-4 NTN-B conforme horizonte
    const ntnSelecionadas = this.selecionarNTN(mercado.tesouro.ipca, horizonte);
    ntnSelecionadas.forEach(ntn => {
      ipcaAtivos.push({
        ativo: ntn.ativo,
        classe: 'IPCA (Proteção à Inflação)',
        taxa: ntn.taxa,
        tipo: 'Tesouro',
        pct: Math.round(alocacao.ipca / ntnSelecionadas.length)
      });
    });
    
    ativos.push(...ipcaAtivos);
  }
  
  // PRÉ: LTN (2-3 ativos)
  if (alocacao.pre > 0) {
    const preAtivos = [];
    
    const ltnSelecionadas = mercado.tesouro.prefixado.slice(0, 2);
    ltnSelecionadas.forEach(ltn => {
      preAtivos.push({
        ativo: ltn.ativo,
        classe: 'Pré-fixado',
        taxa: `${ltn.taxa}%`,
        tipo: 'Tesouro',
        pct: Math.round(alocacao.pre / ltnSelecionadas.length)
      });
    });
    
    ativos.push(...preAtivos);
  }
  
  // USD: ETFs (2-3 ativos)
  if (alocacao.usd > 0) {
    const usdAtivos = [];
    
    // Índice Amplo
    const indiceAmplo = mercado.etfs_usd.indice_amplo.opcoes[0];
    usdAtivos.push({
      ativo: `${indiceAmplo.ticker} - ${indiceAmplo.nome}`,
      classe: 'ETF USD (Ações)',
      taxa: `${indiceAmplo.taxa_admin}`,
      tipo: 'ETF',
      pct: Math.round(alocacao.usd * 0.5)
    });
    
    // Emergentes
    const emergentes = mercado.etfs_usd.mercados_emergentes.opcoes[0];
    usdAtivos.push({
      ativo: `${emergentes.ticker} - ${emergentes.nome}`,
      classe: 'ETF USD (Emergentes)',
      taxa: `${emergentes.taxa_admin}`,
      tipo: 'ETF',
      pct: Math.round(alocacao.usd * 0.5)
    });
    
    ativos.push(...usdAtivos);
  }
  
  // BTC: Bitcoin (1-2 ativos)
  if (alocacao.btc > 0 && mercado.bitcoin.length > 0) {
    const btc = mercado.bitcoin[0];
    ativos.push({
      ativo: `${btc.ticker} - ${btc.nome}`,
      classe: 'Bitcoin (Cripto)',
      taxa: `${btc.taxa_admin}`,
      tipo: 'ETF Cripto',
      pct: alocacao.btc
    });
  }
  
  return ativos;
},

selecionarNTN(ntnArray, horizonte) {
  // Seleciona NTN-B que correspondem melhor ao horizonte do usuário
  if (horizonte <= 5) {
    return ntnArray.filter(n => n.ativo.includes('2029') || n.ativo.includes('2032')).slice(0, 3);
  }
  if (horizonte <= 10) {
    return ntnArray.filter(n => !n.ativo.includes('2029')).slice(0, 3);
  }
  return ntnArray.slice(-3);
},

exibirResultado(ativos, mercado) {
  const dataAtualizacao = mercado.dataAtualizacao;
  
  // Cria preview da carteira
  const preview = ativos.map((item, idx) => `
    <div class="carteira-item" style="padding: 1rem; border: 1px solid #e0e0e0; border-radius: 8px; margin-bottom: 0.5rem;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div class="carteira-name">${item.ativo}</div>
          <div style="font-size: 11px; color: #999; margin-top: 4px;">
            ${item.classe} • ${item.tipo} • Taxa: ${item.taxa}
          </div>
        </div>
        <div class="carteira-pct" style="font-size: 18px; font-weight: 700; color: #667eea;">${item.pct}%</div>
      </div>
    </div>
  `).join('');
  
  document.getElementById('carteiraPreview').innerHTML = `
    <div style="margin-bottom: 1.5rem;">
      <div style="font-size: 12px; color: #999; margin-bottom: 1rem;">
        📊 Dados atualizados em: ${dataAtualizacao}
      </div>
      ${preview}
    </div>
  `;
  
  document.getElementById('resultOverlay').classList.remove('hidden');
  document.getElementById('resultOverlay').classList.add('show');
}
