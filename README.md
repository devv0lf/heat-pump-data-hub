# Heat Pump Data Hub

- name: midea
    type: rtuovertcp
    host: 192.168.0.36
    port: 4196
    delay: 1
    timeout: 5
pod tymi danymi mam waveshare który pobiera dane z pompy ciepła. przygotuj pełen skrypt, który przeszuka rejestry pompy i wygeneruje z nim encje, które moge wstawić do HA. skrpyt musi generować plik txt, które wykaże wszystkie rejestry. poźniej niech ten skrypt otworzy ten txt i z niego wygenruje gotowy configuration.yaml do HA.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/cae20049-d894-4ffc-a533-44448ecab33e).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
