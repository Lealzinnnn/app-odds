require('dotenv').config()
const express = require('express')
const axios = require('axios')
const cors = require('cors')

const app = express()
app.use(cors())

const PORT = process.env.PORT || 3000
const PREFERRED_BOOK = "williamhill_us"

function fixOdd(num) {
  return Number(parseFloat(num).toFixed(2))
}

function traduzOU(tipo) {
  return tipo === "Over" ? "Mais de" : "Menos de"
}

function formatStat(stat) {
  if (stat === "player_points") return "Pontos"
  if (stat === "player_rebounds") return "Rebotes"
  if (stat === "player_assists") return "Assistências"
  return stat
}

function evitarMesmoJogo(combo) {
  const set = new Set()
  for (const p of combo) {
    if (set.has(p.jogo)) return false
    set.add(p.jogo)
  }
  return true
}

// 🔥 ESCOLHE BOOKMAKER INTELIGENTE
function escolherBookmaker(lista) {
  if (!lista || !lista.length) return null

  return (
    lista.find(b => b.key === PREFERRED_BOOK) || // tenta williamhill
    lista[0] // fallback qualquer
  )
}

app.get('/gerar', async (req, res) => {
  try {

    const apiKey = process.env.ODDS_API_KEY
    const numLinhas = parseInt(req.query.numLinhas) || 3
    const targetOdd = parseFloat(req.query.targetOdd) || 5

    const jogosResp = await axios.get(
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

    const jogos = jogosResp.data || []

    let timePicks = []
    let playerPicks = []

    // ======================
    // 🟢 TIMES (COM FALLBACK)
    // ======================
    jogos.forEach(jogo => {

      const book = escolherBookmaker(jogo.bookmakers)
      if (!book) return

      const market = book.markets?.find(m => m.key === 'h2h')
      if (!market) return

      const favorito = [...market.outcomes].sort((a, b) => a.price - b.price)[0]

      if (!favorito) return

      timePicks.push({
        tipo: "time",
        jogo: `${jogo.home_team} vs ${jogo.away_team}`,
        aposta: `${favorito.name} vence`,
        odd: fixOdd(favorito.price)
      })
    })

    // ======================
    // 🔵 PLAYER PROPS (COM FALLBACK)
    // ======================
    const props = await Promise.all(
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

    props.forEach((resp, idx) => {

      if (!resp?.data?.bookmakers) return

      const jogo = jogos[idx]
      const book = escolherBookmaker(resp.data.bookmakers)
      if (!book) return

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

    if (!timePicks.length || !playerPicks.length) {
      return res.json([])
    }

    const resultados = []

    // 🔥 UM COMBO POR JOGO (SEM REPETIÇÃO)
    for (let i = 0; i < timePicks.length; i++) {

      const time = timePicks[i]

      let combo = [time]

      let tentativas = 0

      while (combo.length < numLinhas && tentativas < 20) {
        const player = playerPicks[Math.floor(Math.random() * playerPicks.length)]
        combo.push(player)
        tentativas++
      }

      if (!evitarMesmoJogo(combo)) continue

      const total = combo.reduce((acc, p) => acc * p.odd, 1)

      resultados.push({
        odd_total: fixOdd(total),
        picks: combo
      })
    }

    resultados.sort((a, b) =>
      Math.abs(a.odd_total - targetOdd) - Math.abs(b.odd_total - targetOdd)
    )

    res.json(resultados.slice(0, 5))

  } catch (error) {
    console.log(error.response?.data || error.message)
    res.status(500).json({ erro: "Erro ao gerar sugestões" })
  }
})

app.listen(PORT, () => {
  console.log("Servidor rodando 🚀")
})