#!/bin/bash
set -e

pacman -Syu --noconfirm
pacman -S --noconfirm nodejs npm rustup git webkit2gtk-4.1 gtk3 cairo pango glib2 sudo
rustup default stable

useradd builduser -m 2>/dev/null || true
passwd -d builduser
printf 'builduser ALL=(ALL) ALL\n' | tee -a /etc/sudoers
chown -R builduser:builduser .

sudo -H -u builduser bash << 'BUILDEOF'
set -e
rustup default stable
npm ci
npx tauri build --no-bundle

cat << 'PKGBUILD_EOF' > PKGBUILD
pkgname=aether-launcher
pkgver=0.1.0
pkgrel=1
pkgdesc="Aether Launcher"
arch=("x86_64")
url="https://github.com/Alex07lol/aether-launcher"
license=("MIT")
depends=("webkit2gtk-4.1" "gtk3" "cairo" "pango" "glib2")

package() {
  install -Dm755 "$startdir/src-tauri/target/release/aether-launcher" "$pkgdir/usr/bin/aether-launcher"
  install -Dm644 "$startdir/src-tauri/icons/128x128.png" "$pkgdir/usr/share/pixmaps/aether-launcher.png"
  
  mkdir -p "$pkgdir/usr/share/applications"
  cat << DESK > "$pkgdir/usr/share/applications/aether-launcher.desktop"
[Desktop Entry]
Name=Aether Launcher
Exec=aether-launcher
Icon=aether-launcher
Terminal=false
Type=Application
Categories=Utility;
DESK
}
PKGBUILD_EOF

makepkg -R --noconfirm
mkdir -p artifacts
cp *.pkg.tar.zst artifacts/
BUILDEOF
