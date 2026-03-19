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
    const targetOdd = parseFloat(req.query.targetOdd) || 3

    // 🔥 BUSCA TODOS OS JOGOS DISPONÍVEIS
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

    let timePicks = []
    let playerPicks = []

    // =====================
    // 🟢 TIMES (FORTE)
    // =====================
    jogos.forEach(jogo => {
      jogo.bookmakers?.forEach(book => {
        const market = book.markets?.find(m => m.key === 'h2h')
        if (!market) return

        market.outcomes?.forEach(o => {
          if (!o.price || !o.name) return

          timePicks.push({
            tipo: "time",
            jogo: `${jogo.home_team} vs ${jogo.away_team}`,
            aposta: `${o.name} vence`,
            odd: fixOdd(o.price)
          })
        })
      })
    })

    // =====================
    // 🔵 PLAYER PROPS (COMPLETO)
    // =====================
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

            playerPicks.push({
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

    if (!timePicks.length && !playerPicks.length) {
      return res.json([])
    }

    // 🔥 LIMITA PRA NÃO FICAR LIXO
    timePicks = timePicks.slice(0, 20)
    playerPicks = playerPicks.slice(0, 40)

    const resultados = []

    // =====================
    // 🧠 ENGINE INTELIGENTE
    // =====================
    for (let i = 0; i < 200; i++) {

      let combo = []

      // 🔥 SEMPRE COMEÇA COM TIME
      const time = timePicks[Math.floor(Math.random() * timePicks.length)]
      combo.push(time)

      // 🔥 COMPLETA COM PLAYERS
      while (combo.length < numLinhas) {
        const player = playerPicks[Math.floor(Math.random() * playerPicks.length)]
        combo.push(player)
      }

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
    console.log(error.response?.data || error.message)
    res.status(500).json({ erro: error.message })
  }
})

app.listen(PORT, () => {
  console.log("Servidor rodando 🚀")
})