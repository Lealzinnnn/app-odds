require('dotenv').config()
const express = require('express')
const axios = require('axios')
const cors = require('cors')

const app = express()
app.use(cors())

app.get('/', (req, res) => {
  res.send('🔥 API HÍBRIDA RODANDO')
})

// =========================
// 🔥 GERADOR DE COMBINAÇÕES
// =========================
function gerarCombinacoes(arr, tamanho) {
  const resultado = []

  function backtrack(inicio, combo) {
    if (combo.length === tamanho) {
      resultado.push([...combo])
      return
    }

    for (let i = inicio; i < arr.length; i++) {
      combo.push(arr[i])
      backtrack(i + 1, combo)
      combo.pop()
    }
  }

  backtrack(0, [])
  return resultado
}

// =========================
// 🔥 CONVERTE ODDS AMERICANA
// =========================
function converterOdds(american) {
  const odd = parseFloat(american)

  if (odd > 0) return (odd / 100) + 1
  return (100 / Math.abs(odd)) + 1
}

// =========================
// 🔥 ROTA PRINCIPAL
// =========================
app.get('/gerar', async (req, res) => {
  try {
    const targetOdd = parseFloat(req.query.targetOdd) || 3
    const numLinhas = parseInt(req.query.numLinhas) || 3

    // =========================
    // 🟢 1. ODDS REAIS (TIMES)
    // =========================
    const oddsResponse = await axios.get(
      'https://api.the-odds-api.com/v4/sports/basketball_nba/odds/',
      {
        params: {
          apiKey: process.env.ODDS_API_KEY,
          regions: 'us',
          markets: 'h2h',
          oddsFormat: 'decimal'
        }
      }
    )

    let picks = []

    oddsResponse.data.forEach(jogo => {
      const book = jogo.bookmakers[0]
      if (!book) return

      const h2h = book.markets.find(m => m.key === 'h2h')
      if (!h2h) return

      h2h.outcomes.forEach(o => {
        picks.push({
          tipo: "time",
          jogo: `${jogo.home_team} vs ${jogo.away_team}`,
          aposta: `${o.name} vence`,
          odd: o.price,
          confianca: 65 // base
        })
      })
    })

    // =========================
    // 🟡 2. PLAYER PROPS (INTELIGENTE)
    // =========================
    const statsResponse = await axios.get(
      'https://api.sportsgameodds.com/v2/events',
      {
        params: {
          apiKey: process.env.SPORTS_API_KEY,
          leagueID: 'NBA'
        }
      }
    )

    const eventos = statsResponse.data.data || []

    eventos.forEach(evento => {
      const players = evento.stats?.playerStats || {}

      Object.values(players).forEach(player => {

        // 🔥 PONTOS
        if (player.points >= 20) {
          picks.push({
            tipo: "player",
            jogo: evento.teams?.map(t => t.name).join(' vs '),
            aposta: `${player.name} +20 pontos`,
            odd: 1.7,
            confianca: 70
          })
        }

        // 🔥 ASSISTÊNCIAS
        if (player.assists >= 5) {
          picks.push({
            tipo: "player",
            jogo: evento.teams?.map(t => t.name).join(' vs '),
            aposta: `${player.name} +5 assistências`,
            odd: 1.6,
            confianca: 65
          })
        }

        // 🔥 REBOTES
        if (player.rebounds >= 8) {
          picks.push({
            tipo: "player",
            jogo: evento.teams?.map(t => t.name).join(' vs '),
            aposta: `${player.name} +8 rebotes`,
            odd: 1.65,
            confianca: 68
          })
        }

      })
    })

    // =========================
    // 🔥 ORGANIZA PICKS
    // =========================
    picks = picks
      .filter(p => p.odd >= 1.4 && p.odd <= 3)
      .sort((a, b) => b.confianca - a.confianca)
      .slice(0, 20)

    // =========================
    // 🔥 COMBINAÇÕES
    // =========================
    const combinacoes = gerarCombinacoes(picks, numLinhas)

    let melhorCombo = null
    let menorDiff = Infinity

    for (const combo of combinacoes) {
      const oddTotal = combo.reduce((acc, p) => acc * p.odd, 1)
      const diff = Math.abs(targetOdd - oddTotal)

      if (diff < menorDiff) {
        menorDiff = diff

        melhorCombo = {
          odd_total: oddTotal.toFixed(2),
          confianca: Math.round(
            combo.reduce((acc, p) => acc + p.confianca, 0) / combo.length
          ),
          picks: combo
        }
      }
    }

    res.json(melhorCombo)

  } catch (error) {
    console.log("ERRO:", error.response?.data || error.message)
    res.status(500).json({
      erro: "Erro ao gerar sugestões",
      detalhe: error.response?.data || error.message
    })
  }
})

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log(`🚀 Rodando na porta ${PORT}`)
})