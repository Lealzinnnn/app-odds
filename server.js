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

function traduzOU(name) {
  return name?.toLowerCase().includes("over") ? "Mais de" : "Menos de"
}

function formatStat(stat) {
  if (!stat) return ""
  return stat
    .replace("player_", "")
    .replace("_", " ")
}

// =========================
// ROTA PRINCIPAL
// =========================
app.get('/gerar', async (req, res) => {
  try {

    const apiKey = process.env.ODDS_API_KEY

    // 🔥 TODOS OS JOGOS + TODOS MERCADOS BASE
    const oddsResponse = await axios.get(
      'https://api.the-odds-api.com/v4/sports/basketball_nba/odds',
      {
        params: {
          apiKey,
          regions: 'us,eu,uk', // 🔥 MAIS DADOS
          markets: 'h2h,spreads,totals',
          oddsFormat: 'decimal'
        }
      }
    )

    const jogos = oddsResponse.data || []

    let picks = []

    // =========================
    // 🟢 TIMES + TODOS MERCADOS
    // =========================
    jogos.forEach(jogo => {

      const jogoNome = `${jogo.home_team} vs ${jogo.away_team}`

      jogo.bookmakers?.forEach(book => {

        book.markets?.forEach(market => {

          market.outcomes?.forEach(o => {

            if (!o.price) return

            picks.push({
              tipo: "time",
              jogo: jogoNome,
              aposta: `${o.name} (${market.key}${o.point ? " " + o.point : ""})`,
              odd: fixOdd(o.price),
              bookmaker: book.key
            })

          })

        })

      })

    })

    // =========================
    // 🔵 PLAYER PROPS (TODOS POSSÍVEIS)
    // =========================
    const propsRequests = await Promise.all(
      jogos.map(jogo =>
        axios.get(
          `https://api.the-odds-api.com/v4/sports/basketball_nba/events/${jogo.id}/odds`,
          {
            params: {
              apiKey,
              regions: 'us,eu,uk',
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
      const jogoNome = `${jogo.home_team} vs ${jogo.away_team}`

      resp.data.bookmakers.forEach(book => {

        book.markets?.forEach(market => {

          market.outcomes?.forEach(o => {

            if (!o.description || !o.price) return

            picks.push({
              tipo: "player",
              jogo: jogoNome,
              aposta: `${o.description} ${traduzOU(o.name)} ${o.point || ""} ${formatStat(market.key)}`,
              jogador: o.description,
              linha: o.point,
              odd: fixOdd(o.price),
              bookmaker: book.key
            })

          })

        })

      })

    })

    // =========================
    // RETORNO BRUTO (SEM LIMITAÇÃO)
    // =========================
    res.json({
      total_picks: picks.length,
      dados: picks
    })

  } catch (error) {
    console.log(error.response?.data || error.message)
    res.status(500).json({ erro: error.message })
  }
})

app.listen(PORT, () => {
  console.log("Servidor rodando 🚀")
})