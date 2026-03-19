require('dotenv').config()
const express = require('express')
const axios = require('axios')
const cors = require('cors')

const app = express()
app.use(cors())

const PORT = process.env.PORT || 3000

let lastCall = 0

function formatStat(stat) {
  if (stat === "player_points") return "Pontos"
  if (stat === "player_rebounds") return "Rebotes"
  if (stat === "player_assists") return "Assistências"
  return stat
}

function traduzOU(tipo) {
  return tipo === "Over" ? "Mais de" : "Menos de"
}

function fixOdd(num) {
  return Number(parseFloat(num).toFixed(2))
}

function evitarMesmoJogo(combo) {
  const set = new Set()
  for (const p of combo) {
    if (set.has(p.jogo)) return false
    set.add(p.jogo)
  }
  return true
}

function getBestH2H(bookmakers) {
  let best = []

  if (!Array.isArray(bookmakers)) return best

  bookmakers.forEach(book => {
    const market = book.markets?.find(m => m.key === 'h2h')
    if (!market) return

    market.outcomes?.forEach(o => {
      if (!o.name || !o.price) return

      best.push({
        tipo: "time",
        aposta: `${o.name} vence`,
        odd: fixOdd(o.price)
      })
    })
  })

  return best
}

app.get('/gerar', async (req, res) => {
  try {

    const now = Date.now()
    if (now - lastCall < 2000) {
      return res.json({ erro: "Aguarde..." })
    }
    lastCall = now

    const apiKey = process.env.ODDS_API_KEY

    const numLinhas = parseInt(req.query.numLinhas) || 3
    const targetOdd = parseFloat(req.query.targetOdd) || 3

    const oddsResponse = await axios.get(
      'https://api.the-odds-api.com/v4/sports/basketball_nba/odds/',
      {
        params: {
          apiKey,
          regions: 'us',
          markets: 'h2h',
          oddsFormat: 'decimal'
        }
      }
    )

    // 🔥 MAIS JOGOS AGORA
    const jogos = oddsResponse.data.slice(0, 6)

    let picks = []

    // TIMES
    jogos.forEach(jogo => {
      const odds = getBestH2H(jogo.bookmakers)

      odds.forEach(o => {
        picks.push({
          ...o,
          jogo: `${jogo.home_team} vs ${jogo.away_team}`
        })
      })
    })

    // 🔥 MAIS STATS (AGORA COMPLETO)
    const propsRequests = await Promise.all(
      jogos.map(jogo =>
        axios.get(
          `https://api.the-odds-api.com/v4/sports/basketball_nba/events/${jogo.id}/odds`,
          {
            params: {
              apiKey,
              regions: 'us',
              markets: 'player_points,player_rebounds,player_assists',
              oddsFormat: 'decimal'
            }
          }
        ).catch(() => null)
      )
    )

    propsRequests.forEach((resp, idx) => {
      if (!resp?.data?.bookmakers) return

      const jogo = jogos[idx]

      resp.data.bookmakers.forEach(book => {
        book.markets?.forEach(market => {
          market.outcomes?.forEach(o => {

            if (!o.description || !o.point || !o.price) return

            // 🔥 filtro mais leve
            if (o.price < 1.3 || o.price > 3) return

            const overUnder = o.name?.toLowerCase().includes("over") ? "Over" : "Under"

            picks.push({
              tipo: "player",
              jogo: `${jogo.home_team} vs ${jogo.away_team}`,
              aposta: `${o.description} ${traduzOU(overUnder)} ${o.point} ${formatStat(market.key)}`,
              jogador: o.description,
              linha: o.point,
              odd: fixOdd(o.price)
            })

          })
        })
      })
    })

    if (!picks.length) return res.json([])

    const resultados = []

    for (let i = 0; i < 150; i++) {
      const embaralhado = picks.sort(() => Math.random() - 0.5)
      const combo = embaralhado.slice(0, numLinhas)

      if (!evitarMesmoJogo(combo)) continue

      const oddTotal = combo.reduce((acc, p) => acc * p.odd, 1)
      const diff = Math.abs(targetOdd - oddTotal)

      resultados.push({
        odd_total: fixOdd(oddTotal),
        diff,
        picks: combo
      })
    }

    resultados.sort((a, b) => a.diff - b.diff)

    res.json(resultados.slice(0, 5).map(r => ({
      odd_total: r.odd_total,
      picks: r.picks
    })))

  } catch (error) {
    res.status(500).json({ erro: error.message })
  }
})

app.listen(PORT, () => {
  console.log("Servidor rodando 🚀")
})