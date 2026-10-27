# Lacuna de cobertura: introdução até Violet City

Gerado em 2026-10-26 a partir da extração local (nunca commitada) com os mapas de New Bark Town,
Route 29, Cherrygrove City, Route 30, Route 31 e Violet City (30 mapas) e os arquivos globais
alcançados por `CallStd` (31 arquivos no total). Conta todo comando desses arquivos sem handler,
inclusive comandos de scripts globais que esse trecho não chega a usar (por isso a lista superestima).

## O que bloqueia a história

- **Movimento (spec de cutscenes)**: `ApplyMovement` (461), `WaitMovement` (201) e os comandos do
  Pokémon que segue (`ToggleFollowingPokemonMovement`, `WaitFollowingPokemonMovement`,
  `FollowingPokemonMovement`, `ScrCmd_609`, `ScrCmd_729`). Quase todo evento da história tem uma
  cena com movimento; sem ele o script termina como comando faltante (FR-008) no primeiro passo
  da cena. Verificado no app: o gatilho da Route 30 (arquivo 227, entrada 2) para em `ScrCmd_609`.
  **Consequência**: SC-001 (introdução até Violet City sem faltantes) depende do spec de cutscenes,
  que a própria spec 020 deixa fora do escopo.
- **Batalha contra treinador** (`TrainerBattle`, `CheckBattleWon`, `SetTrainerFlag`): spec de
  treinadores. O rival em Cherrygrove não termina.
- **Menus de várias opções** (`MenuInit`, `MenuInitStdGmm`, `MenuItemAdd`, `MenuExec`): pedem uma
  requisição de menu com lista no cliente. Próximo grupo a implementar neste interpretador.
- **Mensagens externas** (`MsgBoxExtern`, `GetStdMsgNaix`): a tabela `ov01_022067C8` do jogo não
  está extraída.

## Próximos grupos sugeridos (ordem por uso)

1. Movimento e câmera (outro spec).
2. Menus de opções; `RestartCurrentScript`; `RestoreOverworld`; `SetAvatarBits` / `UpdateAvatarState` / `GetPlayerState`.
3. Buffers de texto: `BufferPartyMonNick`, `BufferItemName`, `BufferPocketName`, `BufferInt`, `BufferRivalsName`, `NameRival` (o save não tem o nome do rival).
4. Áudio: `TempBGM`, `FadeOutBGM`, `ResetBGM`, `StopSE` (depende de o áudio do cliente aceitar música pedida por script).
5. Os `ScrCmd_3xx` de efeitos de campo (307 a 311) e o resto da lista.

## Lista completa (comando, ocorrências, "bridge" quando é ligação com outro spec)

```text
ApplyMovement	461	bridge
WaitMovement	201	bridge
ToggleFollowingPokemonMovement	54	
MenuItemAdd	53	
WaitFollowingPokemonMovement	52	
FollowingPokemonMovement	52	
RestartCurrentScript	43	
MsgBoxExtern	31	
RestoreOverworld	30	
GetStdMsgNaix	30	
ScrCmd_609	28	
ScrCmd_308	18	
MenuExec	14	
SetAvatarBits	14	
GetItemPocket	12	
ScrCmd_309	10	
TempBGM	10	
MenuInitStdGmm	9	
BufferPartyMonNick	8	
BufferPocketName	8	
ScrCmd_307	8	
ScrCmd_310	8	
ScrCmd_311	8	
ScrCmd_796	8	
GetPlayerState	7	
UpdateAvatarState	7	
ScrCmd_436	6	
GetFriendSprite	5	
ScrCmd_158	5	
FadeOutBGM	4	
HideSaveStats	4	
TrainerBattle	4	bridge
ScrCmd_729	4	
GetFollowPokePartyIndex	3	
MenuInit	3	
GiveEgg	3	
BufferItemName	3	
BufferInt	2	
GetPartySelection	2	
NPCTradeEnd	2	
ScrCmd_815	2	
PromptEasyChat	2	
BufferTrainerClassNameIndef	2	
GetTrcardStars	2	
ScrCmd_379	2	
NonNPCMsgVar	2	
BufferFashionName	2	
BufferBackgroundName	2	
BufferItemNamePlural	2	
CountSavedPhotos	2	
ScrCmd_377	2	
ScrCmd_376	2	
ScrCmd_156	2	
PlayerOnBikeSet	2	
ResetBGM	2	
MartSell	2	bridge
GetGameVersion	2	
RegisterGearNumber	2	
CheckBattleWon	2	
SetTrainerFlag	2	
PhotoAlbumIsFull	2	
CameronPhoto	2	
BankOrWalletIsFull	2	
BankTransaction	2	
KenyaCheck	2	
GetShinyLeafCount	1	
TryGiveShinyLeafCrown	1	
ShowCertificate	1	
ScrCmd_566	1	
LoadNPCTrade	1	
NPCTradeGetReqSpecies	1	
NPCTradeExec	1	
PrimoPasswordCheck1	1	
PrimoPasswordCheck2	1	
BufferPlayerUnionAvatarClassName	1	
BufferUnionRoomAvatarChoices	1	
UnionRoomAvatarIdxToTrainerClass	1	
Capitalize	1	
UnionRoomAvatarIdxToSprite	1	
ScrCmd_289	1	
DebugWatch	1	
ScrCmd_599	1	
PartyCountNotEgg	1	
PokeCenAnim	1	
PartyHasPokerus	1	
ScrCmd_148	1	
ScrCmd_061	1	
SurvivePoisoning	1	
CountAliveMons	1	
OverworldWhiteOut	1	
ScrCmd_347	1	
ShowSaveStats	1	
GetSaveFileState	1	
PlayerMovementSavingSet	1	
PlayerMovementSavingClear	1	
AddWaitingIcon	1	
SaveGameNormal	1	
RemoveWaitingIcon	1	
WaitButtonOrDelay	1	
SaveWipeExtraChunks	1	
ScrCmd_642	1	
ScrCmd_403	1	
ScrCmd_406	1	
ScrCmd_500	1	
ScrCmd_501	1	
ScrCmd_502	1	
GetUniqueSealsQuantity	1	
OpenPhotoAlbum	1	
ScrCmd_706	1	
ScrCmd_164	1	
ScrCmd_446	1	
ScrCmd_450	1	
ScrCmd_455	1	
PlayerOnBikeCheck	1	
EggHatchAnim	1	
ScrCmd_492	1	
ScrCmd_494	1	
SetPhoneCall	1	
RunPhoneCall	1	
AddSpecialGameStat2	1	
ScrCmd_166	1	
ScrCmd_662	1	
MartBuy	1	bridge
SpecialMartBuy	1	bridge
ScrCmd_771	1	
ScrCmd_772	1	
ScrCmd_806	1	
GiveTogepiEgg	1	
GivePokedex	1	
ScrCmd_573	1	
SetSpawn	1	
VioletGymInit	1	
GetPhoneBookRematch	1	
CheckRegisteredPhoneNumber	1	
AddSpecialGameStat	1	
WhiteOut	1	
VioletGymElevator	1	
StopSE	1	
GiveRunningShoes	1	
RegisterPokegearCard	1	
ScrCmd_795	1	
CheckBankBalance	1	
HasEnoughMoneyVar	1	
PlaceStarterBallsInElmsLab	1	
ScrCmd_605	1	
ScrCmd_608	1	
NicknameInput	1	
GetPartyMonForm2	1	
UnsetPhoneCallTrigger	1	
NameRival	1	
BufferRivalsName	1	
MonGetFriendship	1	
BufferPartyMonSpeciesNameIndef	1	
ScrCmd_596	1	
ScrCmd_600	1	
ScrCmd_582	1	
BufferFriendsName	1	
KenyaCheckPartyOrMailbox	1	
PartySelectUI	1	
CheckReturnLoanMon	1	
ReturnLoanMon	1	
ScrCmd_606	1	
MonGiveMail	1	
MonHasRibbon	1	
GiveRibbon	1	
CatchingTutorial	1	
```
