mkdir -p www
cp -r index.html css js manifest.json digits.ttf icon-192.png icon-512.png www/
npm init -y
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init "Clock App" com.emonscorporation.clockapp --web-dir=www
npx cap add android
echo "node_modules" >> .gitiggitignore