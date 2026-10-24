# Contrato: descoberta na LAN

- UDP, porta `47801`, broadcast `255.255.255.255` e broadcast de cada interface IPv4 não interna.
- Host envia a cada 1 s enquanto a sessão hospedada está aberta; para ao fechar.
- Ouvinte só ativo com a tela Entrar aberta.

## Pacote (JSON, ≤ 512 bytes, validado por zod; inválido é ignorado)

```json
{
  "game": "soulsilver",
  "v": 1,
  "sessionId": "8f3a…",
  "hostName": "Gold",
  "players": 2,
  "maxPlayers": 4,
  "protocolVersion": 4,
  "appVersion": "0.5.0",
  "port": 47800
}
```

## Lista

- Chave: `sessionId`; endereço = IP de origem do pacote + `port`.
- Entrada expira 4 s após o último pacote.
- `protocolVersion` ≠ local → desabilitada, motivo `"Versão <appVersion>, a sua é <local>"`.
- `players >= maxPlayers` → desabilitada, motivo `"Cheia"`.
- Hosts com o mesmo nome aparecem separados, mostrando o IP.
