// === 📦 CONFIGURATION VARIABLES ===

// 🔑 Your Actual Budget sync ID (Settings → Advanced → Sync ID)
const syncId = "YOUR_SYNC_ID"

// 🔐 API key set in your actual-http-api server (must match the `API_KEY` env variable)
const apiKey = "YOUR_API_KEY"

// 🌐 Base URL of your actual-http-api instance (no trailing slash)
const apiBaseUrl = "https://your-actual-api.example.com"

// 📁 Name of the category group to display in the widget
const targetGroupName = "Category Group Title"

// 💸 Currency formatting
const currencyPrefix = "$"  // Symbol shown before the number
const currencySuffix = ""   // Text shown after the number

// === 🎨 APPEARANCE SETTINGS ===

// Font sizes
const textSize = 16                         // Category name
const balanceSize = 16                      // Category balance
const groupTitleSize = 12                   // Title line
const footerTextSize = 10                   // Footer line

// Text colors (dynamic)
const groupTitleColor = Color.dynamic(Color.black(), Color.white())   // Title adapts to theme
const footerTextColor = Color.dynamic(Color.darkGray(), Color.lightGray()) // Footer adapts to theme
const positiveColor = Color.green()         // Balance > 0
const zeroColor = Color.gray()              // Balance = 0
const negativeColor = Color.red()           // Balance < 0

// Layout
const itemSpacing = 10                      // Space between lines
const widgetPadding = 20                    // Padding around widget edges

// === 🔍 UNCATEGORISED TRANSACTIONS SETTINGS ===

const lookbackDays = 30                     // Days to look back for uncategorised txns
const uncategorisedBgColor = new Color("#333333", 0.2)  // Background box color
const uncategorisedTextColor = Color.orange()           // Text color
const uncategorisedBoxPadding = 6           // Padding inside the summary box
const uncategorisedFontSize = 12            // Font size for uncategorised summary

// === ⚙️ BEHAVIOUR SETTINGS ===

const enableDebugLogging = true             // Log fetch/debug info to console

// === 🔧 Helper: Format Amount
function formatAmount(amount) {
  const abs = Math.abs(amount)
  const formatted = `${currencyPrefix}${(abs / 100).toFixed(2)}${currencySuffix}`
  return amount < 0 ? `-${formatted}` : formatted
}

// === 📆 Helper: ISO date N days ago
function isoDateNDaysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

// === 📅 Format timestamps
const now = new Date()
const isoMonth = now.toISOString().slice(0, 7)

const monthFormatter = new DateFormatter()
monthFormatter.dateFormat = "MMMM yyyy"
const prettyMonth = monthFormatter.string(now)

const timeFormatter = new DateFormatter()
timeFormatter.useNoDateStyle()
timeFormatter.useShortTimeStyle()

// === 🧾 Try loading cache
let w = new ListWidget()
let cache = null
let data, lastSuccessTime, failedNow = false

if (Keychain.contains("actual-cache")) {
  try {
    cache = JSON.parse(Keychain.get("actual-cache"))
  } catch (e) {
    console.warn("⚠️ Cache could not be parsed")
  }
}

const req = new Request(`${apiBaseUrl}/v1/budgets/${syncId}/months/${isoMonth}/categorygroups`)
req.headers = {
  "x-api-key": apiKey,
  "accept": "application/json"
}

try {
  data = await req.loadJSON()
  Keychain.set("actual-cache", JSON.stringify({ timestamp: now.toISOString(), data }))
  lastSuccessTime = now
} catch (e) {
  console.error("❌ API fetch failed:", e)
  if (cache) {
    data = cache.data
    lastSuccessTime = new Date(cache.timestamp || Date.now())
    failedNow = true
  } else {
    w.addText("❌ No data & no cache available.")
    Script.setWidget(w)
    Script.complete()
    return
  }
}

// === 🧾 Fetch uncategorised transactions
const accountsReq = new Request(`${apiBaseUrl}/v1/budgets/${syncId}/accounts`)
accountsReq.headers = { "x-api-key": apiKey, "accept": "application/json" }

let uncategorised = []
let accountStats = []

let accountData
try {
  accountData = await accountsReq.loadJSON()
  const validAccounts = accountData.data.filter(a => !a.closed && !a.offbudget)
  if (enableDebugLogging) console.log(`✅ Found ${validAccounts.length} accounts`)

  const sinceDate = isoDateNDaysAgo(lookbackDays)

  for (let acc of validAccounts) {
    const txUrl = `${apiBaseUrl}/v1/budgets/${syncId}/accounts/${acc.id}/transactions?since_date=${sinceDate}`
    const txReq = new Request(txUrl)
    txReq.headers = { "x-api-key": apiKey, "accept": "application/json" }

    try {
      const txData = await txReq.loadJSON()
      const uncats = txData.data.filter(tx =>
        !tx.category &&
        !tx.transfer_id &&
        !tx.starting_balance_flag
      )

      uncategorised.push(...uncats)

      if (enableDebugLogging) {
        console.log(`📒 ${acc.name}: ${uncats.length} uncategorised / ${txData.data.length} total`)
        for (const tx of uncats) {
          console.log(`  - ${formatAmount(tx.amount)} on ${tx.date}`)
        }
      }

      accountStats.push({ name: acc.name, total: txData.data.length, uncategorised: uncats.length, error: false })

    } catch (err) {
      console.warn(`❌ Failed to fetch transactions for '${acc.name}' (${acc.id})`)
      console.warn(err.message || err)
      accountStats.push({ name: acc.name, total: 0, uncategorised: 0, error: true })
      failedNow = true
    }
  }

} catch (err) {
  console.error("❌ Failed to fetch account list")
  console.error(err.message || err)
  failedNow = true
}

if (enableDebugLogging) {
  console.log(`📦 Uncategorised transactions pulled from ${failedNow ? "cache" : "API"} | Count: ${uncategorised.length}`)
}

// === 📂 Display category group
const groups = data.data
const targetGroup = groups.find(g => g.name === targetGroupName)

if (!targetGroup) {
  w.addText(`❌ Group '${targetGroupName}' not found`)
} else {
  const title = w.addText(`${prettyMonth} • ${targetGroup.name}`)
  title.font = Font.boldSystemFont(groupTitleSize)
  title.textColor = groupTitleColor
  w.addSpacer(12)

  for (const cat of targetGroup.categories) {
    const stack = w.addStack()
    stack.layoutHorizontally()
    stack.centerAlignContent()

    const nameTxt = stack.addText(cat.name)
    nameTxt.font = Font.systemFont(textSize)
    nameTxt.textColor = Color.dynamic(Color.black(), Color.white()) // ✅ Dynamic category text

    stack.addSpacer()

    const balTxt = stack.addText(formatAmount(cat.balance))
    balTxt.font = Font.boldSystemFont(balanceSize)

    if (cat.balance > 0) balTxt.textColor = positiveColor
    else if (cat.balance < 0) balTxt.textColor = negativeColor
    else balTxt.textColor = zeroColor

    w.addSpacer(itemSpacing)
  }
}

// === 📦 Insert uncategorised transaction box (if applicable)
if (uncategorised.length >= 1) {
  const totalAmount = uncategorised.reduce((sum, tx) => sum + tx.amount, 0)
  const totalFormatted = formatAmount(totalAmount)

  const uncatBox = w.addStack()
  uncatBox.layoutVertically()
  uncatBox.backgroundColor = uncategorisedBgColor
  uncatBox.cornerRadius = 8
  uncatBox.setPadding(
    uncategorisedBoxPadding,
    uncategorisedBoxPadding,
    uncategorisedBoxPadding,
    uncategorisedBoxPadding
  )

  const daysNote = `past ${lookbackDays} days`
  const uncatText = uncatBox.addText(`${uncategorised.length} uncategorised: ${totalFormatted} • ${daysNote}`)
  uncatText.font = Font.mediumSystemFont(uncategorisedFontSize)
  uncatText.textColor = uncategorisedTextColor

  w.addSpacer(itemSpacing)
}

// === 🕓 Footer
w.addSpacer(4)
if (failedNow) {
  const failText = w.addText(`❌ Failed: ${timeFormatter.string(now)}`)
  failText.font = Font.systemFont(footerTextSize)
  failText.textColor = footerTextColor

  const lastText = w.addText(`🕓 Last retrieved: ${timeFormatter.string(lastSuccessTime)}`)
  lastText.font = Font.systemFont(footerTextSize)
  lastText.textColor = footerTextColor
} else {
  const refreshText = w.addText(`Last retrieved: ${timeFormatter.string(lastSuccessTime)}`)
  refreshText.font = Font.systemFont(footerTextSize)
  refreshText.textColor = footerTextColor
}

// === 🔁 Auto-refresh
const refreshInterval = failedNow ? 30 : 360 // in minutes
const nextRefresh = new Date(Date.now() + refreshInterval * 60 * 1000)
w.refreshAfterDate = nextRefresh

// === 📱 Display widget
w.setPadding(widgetPadding, widgetPadding, widgetPadding, widgetPadding)
w.presentLarge()
Script.setWidget(w)
Script.complete()
