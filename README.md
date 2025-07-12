# Grant Matcher Frontend

This repository contains a small static website that allows researchers to select their name and view matching grants. The data is stored in the `grants.json` and `matches.json` files at the repository root.

## Running Locally

Use any static file server to preview the site locally. If you have Python installed, run:

```bash
python3 -m http.server 8000
```

Then open [http://localhost:8000/app/](http://localhost:8000/app/) in your browser.

## Deployment

The site is a pure static website (HTML/CSS/JS). It can be deployed easily on any static hosting service. Popular options include:

- **GitHub Pages** – push the repository to GitHub and enable GitHub Pages in the repository settings. Point the Pages source to the `main` branch.
- **Netlify** – create a new site from Git, set the publish directory to the repository root, and deploy.

No build step is required.

## Palette

The design uses a white background with deep navy (`#213646`) and vivid cyan (`#1DBEE6`) accents.
