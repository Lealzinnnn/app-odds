require('dotenv').config()
const express = require('express')
const axios = require('axios')
const cors = require('cors')

const app = express()

app.use(cors())

app.get('/', (req, res) => {
  res.send('API de Basquete rodando 🏀')
})

// 🔥 FUNÇÃO PARA GERAR COMBINAÇÕES DINÂMICAS
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

// =======================
// 🔥 ROTA ORIGINAL (ODDS)
// =======================
app.get('/gerar', async (req, res) => {
  try {
    const apiKey = process.env.ODDS_API_KEY

    const targetOdd = parseFloat(req.query.targetOdd) || 3
    const numLinhas = parseInt(req.query.numLinhas) || 3
    const minHitRate = parseFloat(req.query.minHitRate) || 0
    const minConfidence = parseFloat(req.query.minConfidence) || 0

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

    // 🔥 FILTRO MELHORADO
    picks = picks
      .filter(p =>
        p.odd >= 1.2 &&
        (p.hitRate * 10) >= minHitRate &&
        p.confianca >= minConfidence
      )
      .sort((a, b) => b.confianca - a.confianca)

    // 🔥 LIMITA PRA NÃO EXPLODIR
    picks = picks.slice(0, 12)

    const combinacoes = gerarCombinacoes(picks, numLinhas)

    let melhorCombo = null
    let menorDiferenca = Infinity

    for (const combo of combinacoes) {
      const oddTotal = combo.reduce((acc, p) => acc * p.odd, 1)

      const margem = Math.max(0.5, targetOdd * 0.25)

      if (oddTotal > targetOdd + margem) continue

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

    // 🔥 PROTEÇÃO DE ERRO
    if (!melhorCombo) {
      return res.json({
        erro: "Poucas opções com esses filtros",
        sugestao: "Diminua o hit rate ou a confiança mínima"
      })
    }

    res.json(melhorCombo)

  } catch (error) {
    console.log(error.response?.data || error.message)
    res.status(500).send('Erro ao gerar sugestões')
  }
})

// =======================
// 🔥 NOVA ROTA (PROPS)
// =======================
app.get('/props', async (req, res) => {
  try {
    const apiKey = process.env.SPORTS_API_KEY

    const response = await axios.get(
      'https://api.sportsgameodds.com/v1/events',
      {
        headers: {
          'x-api-key': apiKey
        },
        params: {
          sport: 'basketball',
          league: 'nba'
        }
      }
    )

    const eventos = response.data.data || []

    let picks = []

    eventos.slice(0, 5).forEach(evento => {
      const jogadores = evento.players || []

      jogadores.forEach(jogador => {
        const stats = jogador.stats || {}

        if (stats.points) {
          picks.push({
            jogador: jogador.name,
            tipo: "Pontos",
            linha: stats.points,
            odd: 1.8
          })
        }

        if (stats.assists) {
          picks.push({
            jogador: jogador.name,
            tipo: "Assistências",
            linha: stats.assists,
            odd: 1.7
          })
        }

        if (stats.rebounds) {
          picks.push({
            jogador: jogador.name,
            tipo: "Rebotes",
            linha: stats.rebounds,
            odd: 1.9
          })
        }
      })
    })

    res.json({
      total: picks.length,
      picks: picks.slice(0, 10)
    })

  } catch (error) {
    console.log(error.response?.data || error.message)
    res.status(500).send('Erro ao buscar props')
  }
})

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`)
})

console.log("🔥 API COMPLETA COM PROPS + ODDS")