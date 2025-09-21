// === 📦 CONFIGURATION VARIABLES ===

// 🔑 Your Actual Budget sync ID (Settings → Advanced → Sync ID)
const syncId = "YOUR_SYNC_ID"

// 🔐 API key set in your actual-http-api server (must match the `API_KEY` env variable)
const apiKey = "YOUR_API_KEY"

// 🌐 Base URL of your actual-http-api instance (no trailing slash)
const apiBaseUrl = "https://your-actual-api.example.com"

// 🔖 Widget title, by default "Net Worth"
const widgetTitleText = "Net Worth"

// 📅 Number of months to look back, by default plot the net worth data for the last 6 months
const monthsLookBack = 6

// === Cache settings ===

const cacheKeyPrefix = "netWorthHistory"
const cacheTTLMinutes = 60 * 6 // refresh every 6 hours

// === 📆 Dates: monthsLookBack → today ===

const cacheKey = cacheKeyPrefix + monthsLookBack
const today = new Date()
const untilDate = today.toISOString().slice(0, 10)

const monthsLookBackDate = new Date()
monthsLookBackDate.setMonth(monthsLookBackDate.getMonth() - monthsLookBack)
const sinceDate = monthsLookBackDate.toISOString().slice(0, 10)

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
const marginLeft = 50  // shifted more left
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

// === 📄 Fetch accounts list & history if cache not valid ===
if (!cacheValid) {
  let accounts = []
  try {
    const accountsReq = new Request(`${apiBaseUrl}/v1/budgets/${syncId}/accounts`)
    accountsReq.headers = { "x-api-key": apiKey, "accept": "application/json" }
    const accountsData = await accountsReq.loadJSON()
    accounts = accountsData.data.filter(a => !a.closed)
  } catch (err) {
    console.error("Failed to fetch accounts:", err)
  }

  historyData = {}
  for (let acc of accounts) {
    try {
      const url = `${apiBaseUrl}/v1/budgets/${syncId}/accounts/${acc.id}/balancehistory?since_date=${sinceDate}&until_date=${untilDate}`
      const req = new Request(url)
      req.headers = { "x-api-key": apiKey, "accept": "application/json" }
      const data = await req.loadJSON()
      const accData = data.data || {}
      for (let date in accData) {
        if (!historyData[date]) historyData[date] = 0
        historyData[date] += accData[date] / 100
      }
    } catch (err) {
      console.error(`Failed to fetch history for ${acc.name}:`, err)
    }
  }

  // Save cache
  try {
    Keychain.set(cacheKey, JSON.stringify({ timestamp: today.toISOString(), data: historyData }))
  } catch (e) {
    console.warn("Failed to save cache:", e)
  }
}

// === Sort dates & prepare balances ===
const dates = Object.keys(historyData).sort()
const balances = dates.map(d => historyData[d])
const minBalance = Math.min(...balances)
const maxBalance = Math.max(...balances)
const midBalance = (minBalance + maxBalance) / 2
const latestBalance = balances[balances.length - 1] || 0

// === Formatters ===
function formatDollarShort(v) {
  if (v >= 1_000_000) return `$${(v/1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `$${(v/1_000).toFixed(1)}K`
  return `$${v.toFixed(0)}`
}
function formatDollarFull(v) {
  return `$${v.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`
}

// === Mapping functions ===
function xForIndex(i) { return marginLeft + (i / (dates.length - 1)) * chartW }
function yForValue(v) { return marginTop + chartH - ((v - minBalance) / (maxBalance - minBalance)) * chartH }

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

// === Y-axis labels (shortened + moved left) ===
ctx.setFont(Font.systemFont(12))
ctx.setTextAlignedLeft()
ctx.setTextColor(Color.dynamic(Color.darkGray(), Color.lightGray()))
ctx.drawText(formatDollarShort(maxBalance), new Point(0, marginTop - 6))
ctx.drawText(formatDollarShort(midBalance), new Point(0, marginTop + chartH/2 - 6))
ctx.drawText(formatDollarShort(minBalance), new Point(0, marginTop + chartH - 10))

// === X-axis labels (adaptive, spaced evenly, last label nudged left) ===
ctx.setTextAlignedCenter()

// Group indices by month
let monthGroups = {}
for (let i = 0; i < dates.length; i++) {
  const d = new Date(dates[i])
  const key = `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,"0")}`
  if (!monthGroups[key]) monthGroups[key] = []
  monthGroups[key].push(i)
}

// Decide step size (show fewer labels if too many months)
const months = Object.keys(monthGroups)
let step = 1
if (months.length > 6 && months.length <= 18) step = 2
else if (months.length > 18 && months.length <= 24) step = 3
else if (months.length > 24 && months.length <= 40) step = 4
else if (months.length > 40) step = 6

// Draw labels
for (let m = 0; m < months.length; m += step) {
  const idxs = monthGroups[months[m]]
  const midIndex = Math.floor((idxs[0] + idxs[idxs.length - 1]) / 2)

  let x = xForIndex(midIndex)
  // If it's the last month label, nudge left by ~10px
  if (m + step >= months.length) {
    x -= 10
  }

  const d = new Date(dates[midIndex])
  const label = `${(d.getMonth()+1)}/${d.getFullYear().toString().slice(-2)}`
  ctx.drawText(label, new Point(x, marginTop + chartH + 8))
}

// === Line graph ===
ctx.setStrokeColor(Color.blue())
ctx.setLineWidth(2)
for (let i = 0; i < balances.length - 1; i++) {
  const p1 = new Point(xForIndex(i), yForValue(balances[i]))
  const p2 = new Point(xForIndex(i + 1), yForValue(balances[i + 1]))
  const path = new Path()
  path.move(p1)
  path.addLine(p2)
  ctx.addPath(path)
  ctx.strokePath()
}

// === Points ===
ctx.setFillColor(Color.purple())
const pointsStep = Math.ceil(balances.length / 60)
for (let i = 0; i < balances.length; i += pointsStep) {
  const pt = new Point(xForIndex(i), yForValue(balances[i]))
  ctx.fillEllipse(new Rect(pt.x - 2, pt.y - 2, 4, 4))
}

// === Add image to widget ===
let img = ctx.getImage()
let imgView = w.addImage(img)
imgView.centerAlignImage()

// Footer: show latest balance
w.addSpacer(8)
const footer = w.addText(formatDollarFull(latestBalance))
footer.font = Font.boldSystemFont(16)
footer.textColor = latestBalance >= 0 ? Color.green() : Color.red()

// === Display widget ===
if (config.runsInWidget) {
  Script.setWidget(w)
} else {
  w.presentLarge()
}
Script.complete()