require('dotenv').config()
const express = require('express')
const axios = require('axios')
const cors = require('cors')

const app = express()
app.use(cors())

const PORT = process.env.PORT || 3000

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

// evitar repetir jogo
function evitarMesmoJogo(combo) {
  const set = new Set()
  for (const p of combo) {
    if (set.has(p.jogo)) return false
    set.add(p.jogo)
  }
  return true
}

app.get('/gerar', async (req, res) => {
  try {

    const apiKey = process.env.ODDS_API_KEY
    const numLinhas = parseInt(req.query.numLinhas) || 3
    const targetOdd = parseFloat(req.query.targetOdd) || 5.5

    const MIN_ODD = targetOdd - 1
    const MAX_ODD = targetOdd + 1

    // =========================
    // 🔥 TODOS OS JOGOS
    // =========================
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

    const jogos = oddsResponse.data || []

    let picks = []

    // =========================
    // 🟢 TIMES
    // =========================
    jogos.forEach(jogo => {
      jogo.bookmakers?.forEach(book => {
        const market = book.markets?.find(m => m.key === 'h2h')
        if (!market) return

        market.outcomes?.forEach(o => {
          if (!o.name || !o.price) return

          picks.push({
            tipo: "time",
            jogo: `${jogo.home_team} vs ${jogo.away_team}`,
            aposta: `${o.name} vence`,
            odd: fixOdd(o.price)
          })
        })
      })
    })

    // =========================
    // 🔵 PLAYER PROPS (TODOS)
    // =========================
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

            const overUnder = o.name.toLowerCase().includes("over") ? "Over" : "Under"

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

    // =========================
    // 🧠 ENGINE COM CONTROLE DE ODD
    // =========================
    for (let i = 0; i < 500; i++) {

      const embaralhado = [...picks].sort(() => Math.random() - 0.5)
      const combo = embaralhado.slice(0, numLinhas)

      if (!evitarMesmoJogo(combo)) continue

      const oddTotal = combo.reduce((acc, p) => acc * p.odd, 1)

      // 🔥 FILTRO DE ODD INTELIGENTE
      if (oddTotal < MIN_ODD || oddTotal > MAX_ODD) continue

      resultados.push({
        odd_total: fixOdd(oddTotal),
        picks: combo
      })
    }

    // fallback (caso não encontre dentro da faixa)
    if (resultados.length === 0) {
      return res.json([
        {
          odd_total: 0,
          picks: [],
          aviso: "Nenhuma combinação encontrada dentro da faixa de odd"
        }
      ])
    }

    res.json(resultados.slice(0, 5))

  } catch (error) {
    console.log(error.response?.data || error.message)
    res.status(500).json({ erro: error.message })
  }
})

app.listen(PORT, () => {
  console.log("Servidor rodando 🚀")
})