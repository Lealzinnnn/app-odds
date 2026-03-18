require('dotenv').config()
const express = require('express')
const axios = require('axios')

const app = express()

// rota principal
app.get('/', (req, res) => {
  res.send('API de Basquete rodando 🏀')
})

// 🔥 ROTA NOVA PRO LOVABLE
app.get('/gerar', async (req, res) => {
  try {
    const apiKey = process.env.ODDS_API_KEY

    const targetOdd = parseFloat(req.query.targetOdd) || 3
    const numLinhas = parseInt(req.query.numLinhas) || 3

    const response = await axios.get(
      'https://api.the-odds-api.com/v4/sports/basketball_nba/odds/',
      {
        params: {
          apiKey: apiKey,
          regions: 'us',
          markets: 'h2h',
          oddsFormat: 'decimal'
        }
      }
    )

    const jogos = response.data.slice(0, 10)

    let picks = []

    jogos.forEach(jogo => {
      const book = jogo.bookmakers[0]
      if (!book) return

      const h2h = book.markets.find(m => m.key === 'h2h')
      if (!h2h) return

      h2h.outcomes.forEach(o => {
        const prob = 1 / o.price

        picks.push({
          jogo: `${jogo.home_team} vs ${jogo.away_team}`,
          aposta: `${o.name} vence`,
          odd: o.price,
          probabilidade: prob,
          hitRate: Math.floor(prob * 10),
          confianca: Math.round(prob * 100)
        })
      })
    })

    picks = picks
      .filter(p => p.odd >= 1.3 && p.odd <= 2.5)
      .sort((a, b) => a.odd - b.odd)

    let melhorCombo = null
    let menorDiferenca = Infinity

    for (let i = 0; i < picks.length; i++) {
      for (let j = i + 1; j < picks.length; j++) {
        for (let k = j + 1; k < picks.length; k++) {
          const combo = [picks[i], picks[j], picks[k]]
          const oddTotal = combo.reduce((acc, p) => acc * p.odd, 1)

          const diff = Math.abs(targetOdd - oddTotal)

          if (diff < menorDiferenca) {
            menorDiferenca = diff

            const confiancaMedia = Math.round(
              combo.reduce((acc, p) => acc + p.confianca, 0) / combo.length
            )

            melhorCombo = {
              odd_total: oddTotal.toFixed(2),
              confianca: confiancaMedia,
              picks: combo.map(p => ({
                jogo: p.jogo,
                aposta: p.aposta,
                odd: p.odd,
                hitRate: `${p.hitRate}/10`,
                confianca: `${p.confianca}%`
              }))
            }
          }
        }
      }
    }

    res.json(melhorCombo)

  } catch (error) {
    console.log(error.response?.data || error.message)
    res.status(500).send('Erro ao gerar sugestões')
  }
})

// 🔥 PORTA CORRETA PRO RENDER
const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`)
})

// 🔥 ALTERAÇÃO FORÇADA (IMPORTANTE)
console.log("deploy atualizado v3 🚀")