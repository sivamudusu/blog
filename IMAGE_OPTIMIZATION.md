# Image Optimization Guide

## Current Status ⚠️

Lighthouse detected **311 KiB of unnecessary image data** due to oversized images:

| Image | Current Size | Display Size | Can Save |
|-------|-------------|--------------|----------|
| linkedin-oauth-main.png | 197.3 KiB (1855x1125) | 444x250 | 186.8 KiB |
| maxresdefault.jpg | 106.5 KiB (1188x720) | 444x250 | 92.7 KiB |
| npmo-auth-ldap.png | 39.5 KiB (991x600) | 500x250 | 31.2 KiB |

**Total potential savings: ~311 KiB!**

---

## Quick Fix: Compress Current Images

### Option 1: Online Tools (Easiest)
1. **TinyPNG.com** (PNG & JPG)
   - Go to https://tinypng.com/
   - Drag and drop all images from `/assets/`
   - Download compressed versions
   - Can reduce by 50-70%

2. **Squoosh** (Google's tool)
   - Go to https://squoosh.app/
   - Supports PNG, JPG, WebP
   - See savings before download

### Option 2: Command Line (Linux/Mac)

**ImageMagick (Resize + Compress):**
```bash
# Install (if needed)
brew install imagemagick  # Mac
apt-get install imagemagick  # Linux

# Resize image to display size (444x250)
convert linkedin-oauth-main.png -resize 444x250 linkedin-oauth-main-optimized.png

# Compress PNG
pngquant --quality 70-90 linkedin-oauth-main-optimized.png

# Compress JPG
convert maxresdefault.jpg -quality 80 maxresdefault-optimized.jpg
```

**FFmpeg (Alternative):**
```bash
# Resize and compress
ffmpeg -i linkedin-oauth-main.png -vf scale=444:250 linkedin-oauth-main.png
```

### Option 3: Node.js Script (Automated)

Create `optimize-images.js`:

```javascript
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const assetsDir = './src/assets';
const images = [
  { name: 'linkedin-oauth-main.png', width: 444, height: 250 },
  { name: 'maxresdefault.jpg', width: 444, height: 250 },
  { name: 'npmo-auth-ldap.png', width: 500, height: 250 }
];

async function optimizeImages() {
  for (const img of images) {
    const inputPath = path.join(assetsDir, img.name);
    const outputPath = inputPath;

    try {
      await sharp(inputPath)
        .resize(img.width, img.height, {
          fit: 'cover',
          position: 'center'
        })
        .toFile(outputPath + '.tmp');

      fs.renameSync(outputPath + '.tmp', outputPath);
      console.log(`✓ Optimized ${img.name}`);
    } catch (err) {
      console.error(`✗ Error processing ${img.name}:`, err.message);
    }
  }
}

optimizeImages();
```

Setup:
```bash
npm install sharp
node optimize-images.js
```

---

## Proper Image Sizing Strategy

### For Blog Card Images
**Display size:** 444x250px
**Recommendations:**
- Resize to: **444x250px** (exact fit)
- Quality: **80-85%** for JPG
- Format: **JPG** for photos, **PNG** for graphics

### For Featured Article Images
**Display size:** Full width (~800px at 1x, ~1600px at 2x)
**Recommendations:**
- Resize to: **800px** width for 1x displays
- Provide **1600px** version for 2x (Retina)
- Use **WebP with JPG fallback**

### Responsive Images Implementation
```html
<!-- For featured images -->
<picture>
  <source srcset="/assets/image-1600.webp 1600w, /assets/image-800.webp 800w" type="image/webp">
  <source srcset="/assets/image-1600.jpg 1600w, /assets/image-800.jpg 800w" type="image/jpeg">
  <img src="/assets/image-800.jpg" alt="description" fetchpriority="high" loading="eager">
</picture>

<!-- For card images (lazy load) -->
<picture>
  <source srcset="/assets/card-image.webp" type="image/webp">
  <img src="/assets/card-image.jpg" alt="description" loading="lazy">
</picture>
```

---

## Next Steps: Implement Responsive Images

### Step 1: Create Multiple Versions
For each image, create 2-3 versions:
```bash
# 1x version (standard)
convert image.jpg -resize 444x250 image-444.jpg

# 2x version (Retina/high-DPI)
convert image.jpg -resize 888x500 image-888.jpg

# WebP versions
cwebp image-444.jpg -o image-444.webp
cwebp image-888.jpg -o image-888.webp
```

### Step 2: Update Templates
Update `article-snippet.njk` to use responsive images:
```html
<picture>
  <source srcset="{{post.data.image}}" type="image/webp">
  <img src="{{post.data.image}}" alt="{{post.data.imageAlt}}" loading="lazy">
</picture>
```

### Step 3: Verify with Lighthouse
- Rerun Lighthouse
- Check "Unused CSS" and "Unused JavaScript"
- Target: Reduce unused resources

---

## Batch Optimization Script

Create `batch-optimize.sh` for Mac/Linux:

```bash
#!/bin/bash

cd src/assets

echo "🖼️  Starting image optimization..."

# Optimize PNG files
for file in *.png; do
  if [ -f "$file" ]; then
    pngquant --quality 70-90 --force "$file"
    echo "✓ Optimized $file"
  fi
done

# Optimize JPG files
for file in *.jpg; do
  if [ -f "$file" ]; then
    convert "$file" -quality 85 "$file"
    echo "✓ Optimized $file"
  fi
done

echo "✅ Optimization complete!"
du -sh .
```

Run:
```bash
chmod +x batch-optimize.sh
./batch-optimize.sh
```

---

## Tools & Resources

### Online Compressors:
- [TinyPNG](https://tinypng.com/) - Best for PNG/JPG
- [Squoosh](https://squoosh.app/) - Google's tool, supports WebP
- [EZGIF](https://ezgif.com/) - GIF/animated images
- [Imagemin](https://imagemin.online/) - Batch upload

### Command-line Tools:
- **ImageMagick** - `convert`, `identify` commands
- **ImageOptim** - Mac GUI, drag & drop
- **OptiPNG** - PNG optimization
- **MozJPEG** - JPG optimization
- **WebP** - Google's format (20-30% smaller)

### Node.js Libraries:
- **Sharp** - Fast image processor
- **ImageMin** - Batch optimization
- **Gulp-ImageMin** - Gulp plugin

---

## Expected Lighthouse Impact

### Before Optimization:
- Performance: 70/100
- Unused images: 311 KiB
- LCP: ~3.5s

### After Optimization:
- Performance: **85-90/100** (estimated)
- Unused images: **0 KiB**
- LCP: **~1.8-2.0s**

**Savings: 311 KiB reduction!**

---

## Optimization Checklist

For each image in `/assets/`:

- [ ] **Identify display size** (check CSS/HTML)
- [ ] **Resize to display size** (or 2x for Retina)
- [ ] **Compress**: 
  - JPG: 80-85% quality
  - PNG: 70-90% quality
- [ ] **Convert to WebP** (optional but recommended)
- [ ] **Update HTML** with responsive images
- [ ] **Test** with Lighthouse
- [ ] **Verify** file size reduced by 50%+

---

## Long-term Strategy

### For New Blog Posts:

1. **Take screenshots/photos at exact display size**
   - Card images: 444x250
   - Featured: 800x600

2. **Optimize immediately**
   - Use online tools or scripts
   - Target: < 200KB per image

3. **Use WebP format**
   - 20-30% smaller than JPG
   - All modern browsers support

4. **Add to git**
   - Include compressed versions only
   - Don't commit uncompressed originals

---

## Performance Impact Summary

| Step | Savings | Impact |
|------|---------|--------|
| Resize images | 311 KiB | +10-15 LH score |
| Compress (80% JPG) | 50-70% | Major |
| WebP format | 20-30% | Additional |
| Cache headers | N/A | +10 LH score |
| **Total** | **~350-400 KiB** | **+85-90 LH score** |

**Estimated result: 70 → 88-92 performance score!**

Start with TinyPNG for quick wins! 🚀
