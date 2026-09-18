# VPS Release Hosting — api.climeto.in (existing nginx)

Tumhari nginx file **pehle se ready hai**. Naya block add karne ki zaroorat nahi.

## Tumhara existing nginx (already correct)

```nginx
location ^~ /desktop/stable/ {
    alias /var/www/downloads/desktop/stable/;
    autoindex off;
    add_header Cache-Control "no-cache, no-store, must-revalidate";
    types {
        text/yaml yml yaml;
        application/octet-stream exe blockmap;
    }
    try_files $uri =404;
}
```

## Public URLs

```
https://api.climeto.in/desktop/stable/latest.yml
https://api.climeto.in/desktop/stable/Climeto PWP Setup 1.0.1.exe
```

## VPS folder (ek baar create karo)

```bash
ssh root@147.79.67.71
sudo mkdir -p /var/www/downloads/desktop/stable/archive
sudo chown -R www-data:www-data /var/www/downloads
sudo chmod -R 755 /var/www/downloads
```

## Local `.env`

```env
VPS_HOST=147.79.67.71
VPS_USER=root
VPS_PORT=22
VPS_SSH_KEY_PATH=C:/Users/PC/.ssh/id_ed25519
VPS_RELEASE_PATH=/var/www/downloads/desktop/stable
UPDATE_FEED_URL=https://api.climeto.in/desktop/stable
```

## Har release

```bash
# package.json version bump
npm run electron:release
```

Upload hoga:

```
/var/www/downloads/desktop/stable/
├── latest.yml
├── Climeto PWP Setup 1.0.1.exe
└── archive/
```

## Verify

```bash
curl -I https://api.climeto.in/desktop/stable/latest.yml
curl https://api.climeto.in/desktop/stable/latest.yml
```

Expected: `HTTP/2 200` + yaml with version.

## Note

Pehle humne `/desktop/pwp/releases/` suggest kiya tha — tumhari nginx mein **`/desktop/stable/`** already hai, isliye code ab us path par aligned hai. **Nginx file mein koi change mat karo.**
