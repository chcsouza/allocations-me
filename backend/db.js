const { MongoClient } = require('mongodb');

const MONGODB_URI = 'mongodb+srv://souzauk_db_user:2cu6FO9uep6qpixV@allocations.th9auxq.mongodb.net/allocations?retryWrites=true&w=majority&appName=allocations';
let client;
let db;

async function conectarMongoDB() {
  try {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db('allocations');
    console.log('✅ Conectado ao MongoDB');
    
    // Criar collections se não existirem
    const collections = await db.listCollections().toArray();
    const nomes = collections.map(c => c.name);
    
    if (!nomes.includes('mercado')) {
      await db.createCollection('mercado');
      console.log('✅ Collection "mercado" criada');
    }
    
    return db;
  } catch (err) {
    console.error('❌ Erro ao conectar MongoDB:', err.message);
    process.exit(1);
  }
}

function obterDB() {
  return db;
}

module.exports = { conectarMongoDB, obterDB };
