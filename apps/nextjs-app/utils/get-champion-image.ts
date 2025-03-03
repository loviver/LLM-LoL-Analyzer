export const getChampionImage = (championName: string) => {
  const formattedName = championName
    .toLowerCase()
    .replaceAll("'", "")
    .replaceAll(" ", "")
    .replace(/^./, (char) => char.toUpperCase());

  return `https://ddragon.leagueoflegends.com/cdn/15.4.1/img/champion/${formattedName}.png`;
};
