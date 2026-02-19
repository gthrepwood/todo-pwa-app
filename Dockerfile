# 1. Alap image kiválasztása (LTS verzió ajánlott)
FROM node:20-slim

# 2. Munkakönyvtár létrehozása a konténeren belül
WORKDIR /app

# 3. Package fájlok másolása (így kihasználható a Docker réteg-gyorsítótára)
COPY package*.json ./

# 4. Függőségek telepítése
RUN npm install

# 5. A teljes forráskód másolása
COPY . .

# 6. Port megnyitása (amit az appod használ, pl. 3000)
EXPOSE 3004

# 7. Az alkalmazás indítása
CMD ["npm", "start"]