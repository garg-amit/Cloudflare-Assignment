const assert = require('assert')
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

assert.deepEqual(calculateTotals([
  { protein: 20, carbs: 30, fat: 10 },
  { protein: 5, carbs: 10, fat: 2 },
]), { protein: 25, carbs: 40, fat: 12, calories: 368 })

Promise.all([
  handleRequest(new Request('https://example.com/')),
  handleRequest(new Request('https://example.com/', { method: 'POST' })),
  handleRequest(new Request('https://example.com/missing')),
]).then(async ([home, method, missing]) => {
  assert.equal(home.status, 200)
  assert.match(await home.text(), /Daily Balance/)
  assert.equal(method.status, 405)
  assert.equal(method.headers.get('allow'), 'GET, HEAD')
  assert.equal(missing.status, 404)
})
