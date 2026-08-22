# Bundled Ghostscript (auto-downloaded)

This folder is populated by:

```bash
npm run setup:ghostscript
```

It runs automatically before `npm run electron:build`.

Contents:
- `bin/gswin64c.exe`, `bin/gsdll64.dll`
- `lib/` (required runtime files)

The Windows installer ships this as `resources/ghostscript/`.

License: Ghostscript is AGPL — review redistribution terms before distributing the app.
