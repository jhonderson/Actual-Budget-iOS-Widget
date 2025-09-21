// === 📦 CONFIGURATION VARIABLES ===

// 🔑 Your Actual Budget sync ID (Settings → Advanced → Sync ID)
const syncId = "YOUR_SYNC_ID"

// 🔐 API key set in your actual-http-api server (must match the `API_KEY` env variable)
const apiKey = "YOUR_API_KEY"

// 🌐 Base URL of your actual-http-api instance (no trailing slash)
const apiBaseUrl = "https://your-actual-api.example.com"

// 🔖 Widget title, by default "Savings Rate"
const widgetTitleText = "Savings Rate"

// 📅 Number of months to look back, by default plot the savings rate data for the last 6 months
const monthsLookBack = 6

// 💰 Categories that you consider as savings categories
const targetCategories = [
  '💰 Savings',
  '👴 401K',
  '🚨 Emergency Fund',
]

// === Cache settings ===

const cacheKeyPrefix = "savingsRateHistory"
const cacheTTLMinutes = 60 * 6 // refresh every 6 hours

// === 📆 Dates: monthsLookBack → today ===
const cacheKey = cacheKeyPrefix + monthsLookBack
const today = new Date()
today.setDate(1) // align to month start

const months = []
for (let i = 0; i < monthsLookBack; i++) {
  const d = new Date(today)
  d.setMonth(d.getMonth() - i)
  const ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`
  months.unshift(ym)
}

// === 🖼 Widget base ===
let w = new ListWidget()
w.setPadding(12, 12, 12, 12)

const title = w.addText(widgetTitleText)
title.font = Font.boldSystemFont(16)
title.textColor = Color.dynamic(Color.black(), Color.white())
w.addSpacer(8)

// === 🎨 DrawContext canvas ===
let canvasW = 360
let canvasH = 140
if (config.widgetFamily === "large") canvasH = 220
if (config.widgetFamily === "medium") canvasW = 480

const ctx = new DrawContext()
ctx.size = new Size(canvasW, canvasH)
ctx.opaque = false
ctx.respectScreenScale = true

// Margins
const marginTop = 25
const marginBottom = 20
const marginLeft = 50
const marginRight = 20
const chartW = canvasW - marginLeft - marginRight
const chartH = canvasH - marginTop - marginBottom

// === 📥 Try loading cached data ===
let historyData = null
let cacheValid = false
if (Keychain.contains(cacheKey)) {
  try {
    const cached = JSON.parse(Keychain.get(cacheKey))
    if (cached.timestamp && cached.data) {
      const cacheAge = (Date.now() - new Date(cached.timestamp).getTime()) / (1000*60)
      if (cacheAge < cacheTTLMinutes) {
        historyData = cached.data
        cacheValid = true
      }
    }
  } catch (e) {
    console.warn("Failed to parse cached data:", e)
  }
}

// === 📄 Fetch savings rate if cache not valid ===
if (!cacheValid) {
  historyData = {}
  for (let ym of months) {
    try {
      const url = `${apiBaseUrl}/v1/budgets/${syncId}/months/${ym}`
      const req = new Request(url)
      req.headers = { "x-api-key": apiKey, "accept": "application/json" }
      const data = await req.loadJSON()
      const monthData = data.data

      // ✅ Savings rate calculation
      let totalBudgeted = 0
      for (let group of monthData.categoryGroups) {
        for (let cat of group.categories) {
          if (targetCategories.includes(cat.name)) {
            totalBudgeted += cat.budgeted // no /100
          }
        }
      }

      const totalIncome = monthData.totalIncome // no /100
      const rate = totalIncome > 0 ? (totalBudgeted / totalIncome) * 100 : 0

      historyData[ym] = rate
    } catch (err) {
      console.error("Failed to fetch month:", ym, err)
    }
  }

  // Save cache
  try {
    Keychain.set(cacheKey, JSON.stringify({ timestamp: today.toISOString(), data: historyData }))
  } catch (e) {
    console.warn("Failed to save cache:", e)
  }
}

// === Sort months & prepare values ===
const dates = Object.keys(historyData).sort()
const rates = dates.map(d => historyData[d])
const minRate = Math.min(...rates, 0)
const maxRate = Math.max(...rates, 100)
const midRate = (minRate + maxRate) / 2
const latestRate = rates[rates.length - 1] || 0

// === Mapping functions ===
function xForIndex(i) { return marginLeft + (i / (dates.length - 1)) * chartW }
function yForValue(v) { return marginTop + chartH - ((v - minRate) / (maxRate - minRate)) * chartH }

// === Grid lines ===
ctx.setStrokeColor(Color.dynamic(new Color("#E6E6E6"), new Color("#2B2B2B")))
ctx.setLineWidth(1)
for (let i of [0, 0.5, 1]) {
  const y = marginTop + (i * chartH)
  const linePath = new Path()
  linePath.move(new Point(marginLeft, y))
  linePath.addLine(new Point(canvasW - marginRight, y))
  ctx.addPath(linePath)
  ctx.strokePath()
}

// === Y-axis line ===
const yAxis = new Path()
yAxis.move(new Point(marginLeft, marginTop))
yAxis.addLine(new Point(marginLeft, marginTop + chartH))
ctx.addPath(yAxis)
ctx.setStrokeColor(Color.dynamic(Color.darkGray(), Color.lightGray()))
ctx.setLineWidth(1)
ctx.strokePath()

// === Y-axis labels ===
ctx.setFont(Font.systemFont(12))
ctx.setTextAlignedLeft()
ctx.setTextColor(Color.dynamic(Color.darkGray(), Color.lightGray()))
ctx.drawText(maxRate.toFixed(0) + "%", new Point(0, marginTop - 6))
ctx.drawText(midRate.toFixed(0) + "%", new Point(0, marginTop + chartH/2 - 6))
ctx.drawText(minRate.toFixed(0) + "%", new Point(0, marginTop + chartH - 10))

// === X-axis labels (months) ===
ctx.setTextAlignedCenter()
let step = 1
if (dates.length > 6 && dates.length <= 18) step = 2
else if (dates.length > 18 && dates.length <= 24) step = 3
else if (dates.length > 24) step = 6

for (let i = 0; i < dates.length; i += step) {
  const d = new Date(dates[i] + "-01")
  let x = xForIndex(i)
  if (i + step >= dates.length) x -= 10 // nudge last
  const label = `${d.getMonth()+1}/${d.getFullYear().toString().slice(-2)}`
  ctx.drawText(label, new Point(x, marginTop + chartH + 8))
}

// === Line graph ===
ctx.setStrokeColor(Color.blue())
ctx.setLineWidth(2)
for (let i = 0; i < rates.length - 1; i++) {
  const p1 = new Point(xForIndex(i), yForValue(rates[i]))
  const p2 = new Point(xForIndex(i + 1), yForValue(rates[i + 1]))
  const path = new Path()
  path.move(p1)
  path.addLine(p2)
  ctx.addPath(path)
  ctx.strokePath()
}

// === Points ===
ctx.setFillColor(Color.purple())
const pointsStep = Math.ceil(rates.length / 60)
for (let i = 0; i < rates.length; i += pointsStep) {
  const pt = new Point(xForIndex(i), yForValue(rates[i]))
  ctx.fillEllipse(new Rect(pt.x - 2, pt.y - 2, 4, 4))
}

// === Add image to widget ===
let img = ctx.getImage()
let imgView = w.addImage(img)
imgView.centerAlignImage()

// Footer: show latest rate
w.addSpacer(8)
const footer = w.addText(latestRate.toFixed(1) + "%")
footer.font = Font.boldSystemFont(16)
footer.textColor = latestRate >= 0 ? Color.green() : Color.red()

// === Display widget ===
if (config.runsInWidget) {
  Script.setWidget(w)
} else {
  w.presentLarge()
}
Script.complete()