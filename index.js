if (typeof addEventListener === 'function') {
  addEventListener('fetch', event => {
    event.respondWith(handleRequest(event.request))
  })
}

function handleRequest(request) {
  const url = new URL(request.url)

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } })
  }

  if (url.pathname !== '/') {
    return new Response('Not found', { status: 404 })
  }

  const nonce = crypto.randomUUID().replace(/-/g, '')
  const body = request.method === 'HEAD' ? null : APP_HTML.replace('__NONCE__', nonce)
  return new Response(body, {
    headers: {
      'content-type': 'text/html; charset=UTF-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'content-security-policy':
        "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'nonce-" + nonce + "'; img-src 'self' data:; base-uri 'none'; form-action 'self'",
    },
  })
}

const KCAL_PER_KG = 7700

// Estimates calories and macros from metric profile values using Mifflin-St Jeor and returns daily target values.
function calculateTargets(profile) {
  const base = 10 * profile.weight + 6.25 * profile.height - 5 * profile.age + (profile.sex === 'male' ? 5 : -161)
  const maintenance = base * Number(profile.activity)
  const goalDays = Math.max(1, Number(profile.goalDays) || 1)
  const requestedDeficit = (Number(profile.goalKg) || 0) * KCAL_PER_KG / goalDays
  // Conservative general-wellness defaults; these are estimates, not clinical prescriptions.
  const minimum = profile.sex === 'male' ? 1500 : 1200
  const budget = Math.max(minimum, maintenance - requestedDeficit)
  const protein = profile.weight * 1.6
  const fat = Math.max(profile.weight * 0.7, budget * 0.25 / 9)
  const carbs = Math.max(0, (budget - protein * 4 - fat * 9) / 4)
  return { maintenance, requestedDeficit, actualDeficit: maintenance - budget, budget, protein, carbs, fat, minimum }
}

function calculateTotals(meals) {
  return meals.reduce((sum, meal) => {
    const protein = Math.max(0, Number(meal.protein) || 0)
    const carbs = Math.max(0, Number(meal.carbs) || 0)
    const fat = Math.max(0, Number(meal.fat) || 0)
    sum.protein += protein
    sum.carbs += carbs
    sum.fat += fat
    sum.calories += protein * 4 + carbs * 4 + fat * 9
    return sum
  }, { protein: 0, carbs: 0, fat: 0, calories: 0 })
}

const APP_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#16211a">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="Daily Balance">
  <title>Daily Balance</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #17211b;
      --muted: #68736c;
      --paper: #f5f3ec;
      --card: #fffefa;
      --green: #2b6d4f;
      --green-light: #9ecfb4;
      --orange: #e78752;
      --gold: #e8bc55;
      --red: #b64e45;
      --track: #e4e5df;
      --shadow: 0 18px 45px rgba(28, 45, 35, .08);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--paper);
      color: var(--ink);
      font: 16px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      min-height: 100vh;
    }
    button, input, select { font: inherit; }
    button { cursor: pointer; }
    .shell { width: min(100%, 760px); margin: 0 auto; padding: max(20px, env(safe-area-inset-top)) 18px max(36px, env(safe-area-inset-bottom)); }
    header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 26px; }
    .eyebrow { color: var(--green); font-size: .72rem; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
    h1, h2, p { margin: 0; }
    h1 { margin-top: 2px; font-family: Georgia, serif; font-size: clamp(2rem, 9vw, 3.2rem); line-height: 1; letter-spacing: -.04em; }
    h2 { font-size: 1rem; }
    .date { color: var(--muted); font-size: .82rem; text-align: right; }
    .card { background: var(--card); border: 1px solid rgba(23, 33, 27, .07); border-radius: 24px; box-shadow: var(--shadow); padding: 20px; margin-bottom: 16px; }
    .hero { background: var(--ink); color: white; overflow: hidden; position: relative; }
    .hero:after { background: #456a55; border-radius: 50%; content: ""; height: 180px; opacity: .3; position: absolute; right: -75px; top: -85px; width: 180px; }
    .hero-row { align-items: end; display: flex; justify-content: space-between; position: relative; z-index: 1; }
    .kcal { font-family: Georgia, serif; font-size: 3.5rem; line-height: 1; letter-spacing: -.06em; }
    .kcal-label, .subtle { color: #bdc8c0; font-size: .8rem; }
    .ring {
      align-items: center; background: conic-gradient(var(--orange) var(--progress, 0%), #39463d 0);
      border-radius: 50%; display: flex; height: 88px; justify-content: center; position: relative; width: 88px;
    }
    .ring:before { background: var(--ink); border-radius: 50%; content: ""; height: 68px; width: 68px; }
    .ring span { font-size: .75rem; font-weight: 700; position: absolute; }
    .summary-grid { display: grid; gap: 10px; grid-template-columns: repeat(3, 1fr); margin-top: 22px; }
    .summary-grid div { background: rgba(255,255,255,.07); border-radius: 14px; padding: 11px; }
    .summary-grid strong { display: block; font-size: .95rem; }
    .section-head { align-items: center; display: flex; justify-content: space-between; margin-bottom: 16px; }
    .section-head button, .text-button { background: none; border: 0; color: var(--green); font-size: .8rem; font-weight: 800; padding: 4px; }
    .macro { display: grid; grid-template-columns: 62px 1fr 54px; gap: 10px; align-items: center; margin: 13px 0; }
    .macro-name { font-size: .82rem; font-weight: 700; }
    .track { background: var(--track); border-radius: 99px; height: 11px; overflow: hidden; }
    .fill { border-radius: inherit; height: 100%; min-width: 0; transition: width .35s ease; }
    .protein { background: var(--green); }
    .carbs { background: var(--gold); }
    .fat { background: var(--orange); }
    .macro-value { color: var(--muted); font-size: .75rem; text-align: right; }
    .meal-list { display: grid; gap: 10px; }
    .meal { align-items: center; background: #f7f6f1; border-radius: 15px; display: grid; gap: 10px; grid-template-columns: 1fr auto auto; padding: 13px; }
    .meal strong, .meal small { display: block; }
    .meal small { color: var(--muted); margin-top: 2px; }
    .meal-kcal { font-size: .82rem; font-weight: 800; }
    .remove { background: none; border: 0; color: var(--red); font-size: 1.2rem; padding: 6px; }
    .empty { color: var(--muted); font-size: .88rem; padding: 9px 0; text-align: center; }
    .grid { display: grid; gap: 12px; grid-template-columns: repeat(2, 1fr); }
    label { color: var(--muted); display: block; font-size: .72rem; font-weight: 700; }
    input, select {
      background: #f7f6f1; border: 1px solid #dcddd6; border-radius: 12px; color: var(--ink);
      margin-top: 5px; min-height: 44px; padding: 9px 11px; width: 100%;
    }
    .wide { grid-column: 1 / -1; }
    .primary {
      background: var(--green); border: 0; border-radius: 14px; color: white; font-weight: 800;
      margin-top: 16px; min-height: 48px; width: 100%;
    }
    .warning { background: #fff3df; border-radius: 12px; color: #72501f; display: none; font-size: .78rem; margin-top: 12px; padding: 11px; }
    dialog { background: var(--card); border: 0; border-radius: 24px 24px 0 0; bottom: 0; margin: auto 0 0; max-width: none; padding: 22px 18px max(24px, env(safe-area-inset-bottom)); width: 100%; }
    dialog::backdrop { background: rgba(12, 20, 15, .55); }
    dialog form { margin: auto; max-width: 724px; }
    .dialog-head { align-items: center; display: flex; justify-content: space-between; margin-bottom: 16px; }
    .close { background: #ecece7; border: 0; border-radius: 50%; height: 34px; width: 34px; }
    .fine-print { color: var(--muted); font-size: .7rem; margin-top: 12px; text-align: center; }
    @media (min-width: 650px) {
      .shell { padding-top: 40px; }
      .dashboard { display: grid; gap: 16px; grid-template-columns: 1fr 1fr; }
      .hero { grid-column: 1 / -1; }
      dialog { border-radius: 24px; bottom: auto; margin: auto; max-width: 560px; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <header>
      <div><div class="eyebrow">Nutrition journal</div><h1>Daily Balance</h1></div>
      <div class="date" id="date"></div>
    </header>

    <div class="dashboard">
      <section class="card hero" aria-label="Daily calorie summary">
        <div class="hero-row">
          <div>
            <div class="kcal" id="remaining">—</div>
            <div class="kcal-label">kcal available</div>
          </div>
          <div class="ring" id="calorieRing"><span id="percent">0%</span></div>
        </div>
        <div class="summary-grid">
          <div><span class="subtle">Budget</span><strong id="budget">—</strong></div>
          <div><span class="subtle">Eaten</span><strong id="eaten">0 kcal</strong></div>
          <div><span class="subtle">Deficit</span><strong id="deficit">—</strong></div>
        </div>
      </section>

      <section class="card">
        <div class="section-head"><h2>Macro balance</h2><button type="button" id="openProfile">Edit goal</button></div>
        <div class="macro"><span class="macro-name">Protein</span><div class="track"><div class="fill protein" id="proteinBar"></div></div><span class="macro-value" id="proteinValue">0 / 0g</span></div>
        <div class="macro"><span class="macro-name">Carbs</span><div class="track"><div class="fill carbs" id="carbsBar"></div></div><span class="macro-value" id="carbsValue">0 / 0g</span></div>
        <div class="macro"><span class="macro-name">Fat</span><div class="track"><div class="fill fat" id="fatBar"></div></div><span class="macro-value" id="fatValue">0 / 0g</span></div>
      </section>

      <section class="card">
        <div class="section-head"><h2>Today's meals</h2><button type="button" id="openMeal">+ Add meal</button></div>
        <div class="meal-list" id="mealList"></div>
      </section>
    </div>
    <p class="fine-print">Estimates are for general wellness only. A 5 kg monthly target may be unsafe; consult a qualified clinician before pursuing a large deficit.</p>
  </main>

  <dialog id="profileDialog">
    <form id="profileForm">
      <div class="dialog-head"><h2>Your daily goal</h2><button class="close" type="button" data-close="profileDialog" aria-label="Close">×</button></div>
      <div class="grid">
        <label>Weight (kg)<input name="weight" type="number" min="30" max="300" step="0.1" required></label>
        <label>Height (cm)<input name="height" type="number" min="100" max="250" required></label>
        <label>Age<input name="age" type="number" min="18" max="100" required></label>
        <label>Sex used for estimate<select name="sex"><option value="female">Female</option><option value="male">Male</option></select></label>
        <label class="wide">Activity level<select name="activity"><option value="1.2">Mostly seated</option><option value="1.375">Lightly active</option><option value="1.55">Moderately active</option><option value="1.725">Very active</option></select></label>
        <label>Goal loss (kg)<input name="goalKg" type="number" min="0" max="20" step="0.1" required></label>
        <label>Days<input name="goalDays" type="number" min="7" max="365" required></label>
      </div>
      <div class="warning" id="warning"></div>
      <button class="primary" type="submit">Calculate my target</button>
    </form>
  </dialog>

  <dialog id="mealDialog">
    <form id="mealForm">
      <div class="dialog-head"><h2>Add a meal</h2><button class="close" type="button" data-close="mealDialog" aria-label="Close">×</button></div>
      <div class="grid">
        <label class="wide">Meal name<input name="name" maxlength="40" placeholder="e.g. Greek yogurt bowl" required></label>
        <label>Protein (g)<input name="protein" type="number" min="0" max="500" step="0.1" value="0" required></label>
        <label>Carbs (g)<input name="carbs" type="number" min="0" max="1000" step="0.1" value="0" required></label>
        <label>Fat (g)<input name="fat" type="number" min="0" max="500" step="0.1" value="0" required></label>
      </div>
      <button class="primary" type="submit">Add to today</button>
    </form>
  </dialog>

  <script nonce="__NONCE__">
    const STORAGE_KEY = 'daily-balance-v1'
    const defaultState = () => ({ profile: { weight: 75, height: 175, age: 30, sex: 'male', activity: 1.375, goalKg: 5, goalDays: 30 }, days: {} })
    let state
    try { state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultState() } catch (_) { state = defaultState() }
    if (!state.profile || !state.days) state = defaultState()

    const KCAL_PER_KG = 7700

    function calculateTargets(profile) {
      const base = 10 * profile.weight + 6.25 * profile.height - 5 * profile.age + (profile.sex === 'male' ? 5 : -161)
      const maintenance = base * Number(profile.activity)
      const goalDays = Math.max(1, Number(profile.goalDays) || 1)
      const requestedDeficit = (Number(profile.goalKg) || 0) * KCAL_PER_KG / goalDays
      const minimum = profile.sex === 'male' ? 1500 : 1200
      const budget = Math.max(minimum, maintenance - requestedDeficit)
      const protein = profile.weight * 1.6
      const fat = Math.max(profile.weight * 0.7, budget * 0.25 / 9)
      const carbs = Math.max(0, (budget - protein * 4 - fat * 9) / 4)
      return { maintenance, requestedDeficit, actualDeficit: maintenance - budget, budget, protein, carbs, fat, minimum }
    }

    function calculateTotals(meals) {
      return meals.reduce((sum, meal) => {
        const protein = Math.max(0, Number(meal.protein) || 0)
        const carbs = Math.max(0, Number(meal.carbs) || 0)
        const fat = Math.max(0, Number(meal.fat) || 0)
        sum.protein += protein
        sum.carbs += carbs
        sum.fat += fat
        sum.calories += protein * 4 + carbs * 4 + fat * 9
        return sum
      }, { protein: 0, carbs: 0, fat: 0, calories: 0 })
    }

    const dayKey = () => {
      const now = new Date()
      return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-')
    }
    const meals = () => Array.isArray(state.days[dayKey()]) ? state.days[dayKey()] : []
    const number = value => Math.max(0, Number(value) || 0)
    const round = value => Math.round(value)
    const $ = id => document.getElementById(id)
    const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state))

    function targets() {
      return calculateTargets(state.profile)
    }

    function totals() {
      return calculateTotals(meals())
    }

    function setBar(name, consumed, target) {
      $(name + 'Bar').style.width = (target > 0 ? Math.min(100, consumed / target * 100) : 0) + '%'
      $(name + 'Value').textContent = round(consumed) + ' / ' + round(target) + 'g'
    }

    function render() {
      const goal = targets()
      const total = totals()
      const remaining = goal.budget - total.calories
      const progress = goal.budget > 0 ? Math.min(100, total.calories / goal.budget * 100) : 0
      $('remaining').textContent = round(remaining)
      $('remaining').style.color = remaining < 0 ? '#ff968a' : 'white'
      $('budget').textContent = round(goal.budget) + ' kcal'
      $('eaten').textContent = round(total.calories) + ' kcal'
      $('deficit').textContent = round(goal.actualDeficit) + ' kcal'
      $('percent').textContent = round(progress) + '%'
      $('calorieRing').style.setProperty('--progress', progress + '%')
      setBar('protein', total.protein, goal.protein)
      setBar('carbs', total.carbs, goal.carbs)
      setBar('fat', total.fat, goal.fat)

      const list = $('mealList')
      list.replaceChildren()
      if (!meals().length) {
        const empty = document.createElement('p')
        empty.className = 'empty'
        empty.textContent = 'No meals yet. Add one to begin tracking.'
        list.append(empty)
      }
      meals().forEach(meal => {
        const row = document.createElement('div')
        row.className = 'meal'
        const info = document.createElement('div')
        const name = document.createElement('strong')
        name.textContent = meal.name
        const macros = document.createElement('small')
        macros.textContent = 'P ' + round(meal.protein) + 'g · C ' + round(meal.carbs) + 'g · F ' + round(meal.fat) + 'g'
        info.append(name, macros)
        const kcal = document.createElement('span')
        kcal.className = 'meal-kcal'
        kcal.textContent = round(meal.protein * 4 + meal.carbs * 4 + meal.fat * 9) + ' kcal'
        const remove = document.createElement('button')
        remove.className = 'remove'
        remove.type = 'button'
        remove.setAttribute('aria-label', 'Remove ' + meal.name)
        remove.textContent = '×'
        remove.addEventListener('click', () => {
          state.days[dayKey()] = meals().filter(item => item.id !== meal.id)
          save()
          render()
        })
        row.append(info, kcal, remove)
        list.append(row)
      })
    }

    function populateProfile() {
      const form = $('profileForm')
      Object.keys(state.profile).forEach(key => { if (form.elements[key]) form.elements[key].value = state.profile[key] })
    }

    $('openMeal').addEventListener('click', () => $('mealDialog').showModal())
    $('openProfile').addEventListener('click', () => { populateProfile(); $('profileDialog').showModal() })
    document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(button.dataset.close).close()))

    $('mealForm').addEventListener('submit', event => {
      event.preventDefault()
      const data = new FormData(event.currentTarget)
      const meal = { id: crypto.randomUUID(), name: String(data.get('name')).trim(), protein: number(data.get('protein')), carbs: number(data.get('carbs')), fat: number(data.get('fat')) }
      if (!meal.name) return
      if (!state.days[dayKey()]) state.days[dayKey()] = []
      state.days[dayKey()].push(meal)
      save()
      event.currentTarget.reset()
      $('mealDialog').close()
      render()
    })

    $('profileForm').addEventListener('submit', event => {
      event.preventDefault()
      const data = new FormData(event.currentTarget)
      state.profile = {
        weight: number(data.get('weight')), height: number(data.get('height')), age: number(data.get('age')),
        sex: data.get('sex') === 'female' ? 'female' : 'male', activity: number(data.get('activity')),
        goalKg: number(data.get('goalKg')), goalDays: number(data.get('goalDays'))
      }
      save()
      $('profileDialog').close()
      render()
    })

    $('profileForm').addEventListener('input', () => {
      const form = $('profileForm')
      const days = number(form.elements.goalDays.value)
      const deficit = days > 0 ? number(form.elements.goalKg.value) * KCAL_PER_KG / days : 0
      const warning = $('warning')
      warning.style.display = deficit > 1000 ? 'block' : 'none'
      warning.textContent = deficit > 1000 ? 'This goal requires about ' + round(deficit) + ' kcal of deficit per day. The displayed budget will not go below a general minimum, and professional guidance is recommended.' : ''
    })

    populateProfile()
    $('date').textContent = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date())
    render()
    if (!localStorage.getItem(STORAGE_KEY)) $('profileDialog').showModal()
  </script>
</body>
</html>`

if (typeof module !== 'undefined') {
  module.exports = { calculateTargets, calculateTotals, handleRequest }
}
