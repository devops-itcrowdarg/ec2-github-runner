# Create package

Change only files inside `src` folder.

Then run:
```bash
docker run -it --rm -v ./:/app node:16 bash
cd /app
npm ci
npm run lint
npm run package
```

That will generate a `dist` folder with the package.