# Daily Balance

A mobile-first calorie and macro tracker served by Cloudflare Workers. It estimates a daily calorie budget from weight, height, age, sex, activity, and weight-loss goal; tracks meals and macros; and updates the daily visualizations as meals are added.

Data is stored only in the browser with `localStorage`, so the app can be opened from or added to an iPhone home screen without creating an account.

## Development

```sh
npm install
npm test
wrangler dev
```

Open the local Wrangler URL in a browser. Deploy to a Workers domain with the Wrangler version used by this project.

## Health note

The calculations are estimates for general wellness, not medical advice. The app enforces a general minimum calorie budget and warns when a requested goal implies a deficit above 1,000 kcal/day.
