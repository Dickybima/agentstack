# LooseAgent Launchpad

Frontend launchpad di atas **Pons V2** (Robinhood Chain, chain id 4663). Token di-launch ke bonding curve ETH milik Pons. Saat curve habis terjual, token otomatis graduate ke pool Uniswap v4 dengan likuiditas terkunci permanen.

## Fitur

- **Explore** – daftar launch terbaru (event `TokenLaunched` dari factory Pons), progress graduation, filter, dan pencarian.
- **Launch** – buat token (nama, simbol, logo, deskripsi, sosial, creator tax, buyback) plus dev buy awal secara atomik lewat `PonsV2LaunchAndBuy`.
- **Token page** – harga, market cap, progress, trade terbaru, serta buy/sell di bonding curve dengan quote lokal dan proteksi slippage.
- **Profile** – token yang kamu launch dan klaim creator fee dari fee escrow.

## Menjalankan

```bash
npm install
cp .env.example .env   # opsional: isi RPC sendiri
npm run dev            # http://localhost:5173
npm run build          # output statis di dist/
```

Hasil build berupa situs statis. Bisa di-deploy ke Vercel (`vercel.json` sudah ada), Netlify (`public/_redirects`), atau hosting statis lain.

## Kontrak (Robinhood Chain 4663)

| Kontrak | Alamat |
|---|---|
| PonsV2LaunchFactory | `0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e` |
| PonsV2LaunchAndBuy | `0xe33E9E479dF8802cb0866d5d05258bEc4cF62948` |
| PonsV2MemeHook | `0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044` |
| Fee Escrow | `0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e` |

Alamat dan ABI diambil dari paket publik `pons-client` dan dokumentasi Pons di Bitquery. Cek ulang dengan [docs Pons](https://docs.ponsfamily.com/v2) atau [Blockscout](https://robinhoodchain.blockscout.com) sebelum dipakai dengan dana besar.

## Struktur

```
src/lib/pons.ts      alamat, ABI, matematika curve (quote buy/sell)
src/lib/launches.ts  indexing launch dari log on-chain
src/lib/chain.ts     definisi Robinhood Chain
src/pages/           Home, Create, Token, Profile
```

Untuk mengganti nama brand, ubah `BRAND` di `src/App.tsx` dan `<title>` di `index.html`.
