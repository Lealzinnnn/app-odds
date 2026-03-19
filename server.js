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
  return stat
}

function traduzOU(tipo) {
  return tipo === "Over" ? "Mais de" : "Menos de"
}

function fixOdd(num) {
  return Number(parseFloat(num).toFixed(2))
}

// evitar repetir jogo
function evitarMesmoJogo(combo) {
  const set = new Set()
  for (const p of combo) {
    if (set.has(p.jogo)) return false
    set.add(p.jogo)
  }
  return true
}

// pegar odds de time
function getBestH2H(bookmakers) {
  let best = []

  if (!Array.isArray(bookmakers)) return best

  bookmakers.forEach(book => {
    const market = book.markets?.find(m => m.key === 'h2h')
    if (!market) return

    market.outcomes?.forEach(o => {
      if (!o.name || !o.price) return
      if (o.price < 1.3 || o.price > 3) return

      best.push({
        tipo: "time",
        aposta: `${o.name} vence`,
        odd: fixOdd(o.price)
      })
    })
  })

  return best
}

// rota teste
app.get('/', (req, res) => {
  res.send("API rodando 🚀")
})

// rota principal
app.get('/gerar', async (req, res) => {
  try {

    // 🔒 anti spam (economiza crédito)
    const now = Date.now()
    if (now - lastCall < 3000) {
      return res.json({ erro: "Aguarde alguns segundos..." })
    }
    lastCall = now

    const apiKey = process.env.ODDS_API_KEY

    if (!apiKey) {
      return res.status(500).json({ erro: "API KEY não configurada" })
    }

    const numLinhas = parseInt(req.query.numLinhas) || 3
    const targetOdd = parseFloat(req.query.targetOdd) || 3

    // 🔥 CHAMADA PRINCIPAL (TIMES)
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

    // 🔥 MENOS JOGOS = MENOS CUSTO
    const jogos = Array.isArray(oddsResponse.data)
      ? oddsResponse.data.slice(0, 3)
      : []

    let picks = []

    // 🟢 TIMES
    jogos.forEach(jogo => {
      const odds = getBestH2H(jogo.bookmakers)

      odds.forEach(o => {
        picks.push({
          ...o,
          jogo: `${jogo.home_team} vs ${jogo.away_team}`
        })
      })
    })

    // 🔵 PLAYER PROPS (SÓ PONTOS = ECONOMIA)
    const propsRequests = await Promise.all(
      jogos.map(jogo =>
        axios.get(
          `https://api.the-odds-api.com/v4/sports/basketball_nba/events/${jogo.id}/odds`,
          {
            params: {
              apiKey,
              regions: 'us',
              markets: 'player_points',
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
            if (o.price < 1.4 || o.price > 2.5) return

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

    // 🔥 ENGINE INTELIGENTE
    for (let i = 0; i < 100; i++) {
      const embaralhado = picks.sort(() => Math.random() - 0.5)
      let combo = embaralhado.slice(0, numLinhas)

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

    const final = resultados.slice(0, 5).map(r => ({
      odd_total: r.odd_total,
      picks: r.picks
    }))

    res.json(final)

  } catch (error) {

    if (error.response?.data?.error_code === "OUT_OF_USAGE_CREDITS") {
      return res.json([
        {
          odd_total: 3.5,
          picks: [
            {
              tipo: "time",
              jogo: "Modo demo",
              aposta: "Sem créditos na API",
              odd: 1.5
            }
          ]
        }
      ])
    }

    console.log("🔥 ERRO:", error.response?.data || error.message)

    res.status(500).json({
      erro: error.response?.data || error.message
    })
  }
})

app.listen(PORT, () => {
  console.log("Servidor rodando 🚀")
})