const assert = require('assert')
const vm = require('vm')
const { calculateTargets, calculateTotals, handleRequest } = require('./index')

const profile = {
  weight: 75,
  height: 175,
  age: 30,
  sex: 'male',
  activity: 1.375,
  goalKg: 5,
  goalDays: 30,
}

const target = calculateTargets(profile)
assert.equal(Math.round(target.maintenance), 2336)
assert.equal(target.budget, 1500)
assert.equal(Math.round(target.requestedDeficit), 1283)
assert.ok(Number.isFinite(calculateTargets({ ...profile, goalDays: 0 }).budget))
assert.ok(Number.isFinite(calculateTargets({ ...profile, goalDays: 'invalid' }).budget))

const femaleTarget = calculateTargets({ ...profile, sex: 'female', goalKg: 0.5, goalDays: 90 })
assert.equal(Math.round(femaleTarget.maintenance), 2108)
assert.equal(Math.round(femaleTarget.budget), 2065)
assert.ok(femaleTarget.carbs > 0)

assert.deepEqual(calculateTotals([
  { protein: 20, carbs: 30, fat: 10 },
  { protein: 5, carbs: 10, fat: 2 },
]), { protein: 25, carbs: 40, fat: 12, calories: 368 })
assert.deepEqual(calculateTotals([{ protein: '10', carbs: undefined, fat: -3 }]), { protein: 10, carbs: 0, fat: 0, calories: 40 })

Promise.all([
  handleRequest(new Request('https://example.com/')),
  handleRequest(new Request('https://example.com/', { method: 'POST' })),
  handleRequest(new Request('https://example.com/missing')),
]).then(async ([home, method, missing]) => {
  assert.equal(home.status, 200)
  const html = await home.text()
  assert.match(html, /Daily Balance/)
  assert.match(home.headers.get('content-security-policy'), /script-src 'nonce-[a-f0-9]+'/)
  const clientScript = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)[1]
  assert.doesNotThrow(() => new vm.Script(clientScript))
  const clientContext = {}
  const clientModelMatch = clientScript.match(/const KCAL_PER_KG[\s\S]*?(?=\s+const dayKey)/)
  assert.ok(clientModelMatch, 'Client calculation model should be present')
  const clientModel = clientModelMatch[0]
  vm.runInNewContext(clientModel + '\nresult = calculateTargets(' + JSON.stringify(profile) + ')', clientContext)
  assert.equal(Math.round(clientContext.result.maintenance), Math.round(target.maintenance))
  assert.equal(method.status, 405)
  assert.equal(method.headers.get('allow'), 'GET, HEAD')
  assert.equal(missing.status, 404)
}).catch(error => {
  console.error(error)
  process.exitCode = 1
})
