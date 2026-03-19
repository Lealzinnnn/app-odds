require('dotenv').config()
const express = require('express')
const axios = require('axios')
const cors = require('cors')

const app = express()
app.use(cors())

const PORT = process.env.PORT || 3000

function fixOdd(num) {
  return Number(parseFloat(num).toFixed(2))
}

function formatStat(stat) {
  if (stat.includes("points")) return "Pontos"
  if (stat.includes("rebounds")) return "Rebotes"
  if (stat.includes("assists")) return "Assistências"
  return stat
}

function traduzOU(name) {
  return name.toLowerCase().includes("over") ? "Mais de" : "Menos de"
}

app.get('/gerar', async (req, res) => {
  try {

    const apiKey = process.env.ODDS_API_KEY
    const numLinhas = parseInt(req.query.numLinhas) || 3
    const targetOdd = parseFloat(req.query.targetOdd) || 5.5

    const MIN = targetOdd - 1
    const MAX = targetOdd + 1

    // 🔥 1. TODOS OS JOGOS + MERCADOS
    const oddsResponse = await axios.get(
      'https://api.the-odds-api.com/v4/sports/basketball_nba/odds',
      {
        params: {
          apiKey,
          regions: 'us',
          markets: 'h2h,spreads,totals',
          oddsFormat: 'decimal'
        }
      }
    )

    const jogos = oddsResponse.data || []

    let picks = []

    // =========================
    // 🟢 TIMES + SPREAD + TOTAL
    // =========================
    jogos.forEach(jogo => {

      jogo.bookmakers?.forEach(book => {

        book.markets?.forEach(market => {

          market.outcomes?.forEach(o => {

            if (!o.price) return

            picks.push({
              tipo: "time",
              jogo: `${jogo.home_team} vs ${jogo.away_team}`,
              aposta: `${o.name} ${market.key}${o.point ? ` (${o.point})` : ""}`,
              odd: fixOdd(o.price)
            })

          })

        })

      })

    })

    // =========================
    // 🔵 PLAYER PROPS COMPLETO
    // =========================
    const propsRequests = await Promise.all(
      jogos.map(jogo =>
        axios.get(
          `https://api.the-odds-api.com/v4/sports/basketball_nba/events/${jogo.id}/odds`,
          {
            params: {
              apiKey,
              regions: 'us',
              markets: `
                player_points,
                player_rebounds,
                player_assists,
                player_points_alternate,
                player_rebounds_alternate,
                player_assists_alternate
              `.replace(/\s/g, ''),
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

            if (!o.description || !o.price) return

            picks.push({
              tipo: "player",
              jogo: `${jogo.home_team} vs ${jogo.away_team}`,
              aposta: `${o.description} ${traduzOU(o.name)} ${o.point || ""} ${formatStat(market.key)}`,
              jogador: o.description,
              odd: fixOdd(o.price)
            })

          })

        })

      })

    })

    if (!picks.length) {
      return res.json({ erro: "Sem dados da API" })
    }

    // =========================
    // 🎯 GERAR COMBOS COM ODD CONTROLADA
    // =========================
    const resultados = []

    for (let i = 0; i < 800; i++) {

      const combo = [...picks]
        .sort(() => Math.random() - 0.5)
        .slice(0, numLinhas)

      const total = combo.reduce((acc, p) => acc * p.odd, 1)

      if (total >= MIN && total <= MAX) {
        resultados.push({
          odd_total: fixOdd(total),
          picks: combo
        })
      }

    }

    res.json(resultados.slice(0, 10))

  } catch (error) {
    console.log(error.response?.data || error.message)
    res.status(500).json({ erro: error.message })
  }
})

app.listen(PORT, () => {
  console.log("Servidor rodando 🚀")
})