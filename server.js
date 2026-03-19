require('dotenv').config()
const express = require('express')
const axios = require('axios')
const cors = require('cors')

const app = express()
app.use(cors())

const PORT = process.env.PORT || 3000
const BOOKMAKER = "williamhill_us"

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

// não repetir jogo dentro da bet
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
    const targetOdd = parseFloat(req.query.targetOdd) || 5

    // 🔥 TODOS OS JOGOS (SEM LIMITAÇÃO)
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
    // 🟢 TIMES (1 POR JOGO)
    // ======================
    jogos.forEach(jogo => {

      const book = jogo.bookmakers?.find(b => b.key === BOOKMAKER)
      if (!book) return

      const market = book.markets?.find(m => m.key === 'h2h')
      if (!market) return

      // pega favorito (menor odd)
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
    // 🔵 PLAYER PROPS
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
      const book = resp.data.bookmakers.find(b => b.key === BOOKMAKER)
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

    // 🔥 CADA COMBO = 1 JOGO DIFERENTE
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

    // ordena pelo mais próximo da odd desejada
    resultados.sort((a, b) =>
      Math.abs(a.odd_total - targetOdd) - Math.abs(b.odd_total - targetOdd)
    )

    // 🔥 GARANTE QUE NÃO REPETE JOGO ENTRE RESULTADOS
    const usados = new Set()
    const finais = []

    for (const r of resultados) {
      const jogoPrincipal = r.picks[0].jogo

      if (!usados.has(jogoPrincipal)) {
        finais.push(r)
        usados.add(jogoPrincipal)
      }

      if (finais.length === 5) break
    }

    res.json(finais)

  } catch (error) {
    console.log(error.response?.data || error.message)
    res.status(500).json({ erro: "Erro ao gerar sugestões" })
  }
})

app.listen(PORT, () => {
  console.log("Servidor rodando 🚀")
})