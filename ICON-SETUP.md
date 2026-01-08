# Icon Setup Instructions

The PWA manifest requires icon files that are not included in the repository. You need to create these icon files:

## Required Icons

1. **icon-192.png** - 192x192 pixels
2. **icon-512.png** - 512x512 pixels

## Location

Place both files in the `/public` directory:
- `/public/icon-192.png`
- `/public/icon-512.png`

## Creating Icons

You can create these icons using:

1. **Online Tools:**
   - [PWA Asset Generator](https://github.com/onderceylan/pwa-asset-generator)
   - [RealFaviconGenerator](https://realfavicongenerator.net/)

2. **Design Tools:**
   - Figma
   - Adobe Illustrator
   - Canva

3. **Quick Solution:**
   - Use any image editor to create a simple logo
   - Export as PNG with the required dimensions
   - Use a green theme color (#16a34a) to match the app

## Temporary Workaround

If you need to test the app without icons, you can temporarily comment out the icons array in `app/manifest.ts`, but this will prevent the PWA from installing properly.
