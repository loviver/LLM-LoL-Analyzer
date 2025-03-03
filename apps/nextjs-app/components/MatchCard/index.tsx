import React from 'react';
import { Trophy, X } from 'lucide-react';
import { getChampionImage } from '../../utils/get-champion-image';

const PlayerRow: React.FC<{ player: any }> = ({ player }) => {
  return (
    <div className="flex items-center p-2 border-b border-gray-200">
      <div className="flex-shrink-0 relative">
        <img 
          src={getChampionImage(player.championName)}
          alt={player.championName} 
          className="w-12 h-12 rounded-full object-cover"
        />
        <span className="absolute bottom-0 right-0 bg-gray-800 text-white text-xs px-1 rounded-full">
          {player.level}
        </span>
      </div>
      
      <div className="ml-3 flex-grow">
        <div className="font-medium text-sm">{player.summonerName}</div>
        <div className="text-xs text-gray-600">{player.championName}</div>
        <div className="flex items-center mt-1">
          <span className="text-xs font-semibold">{player.kills}/{player.deaths}/{player.assists}</span>
          <span className="text-xs text-gray-500 ml-2">{player.creepScore} CS</span>
          <span className="text-xs text-yellow-600 ml-2">{player.goldSpent.toLocaleString()} G</span>
        </div>
      </div>
      
      <div className="flex flex-col items-end">
        <div className="flex space-x-1 mb-1">
          {player.spells.map((spell: any, index: any) => (
            <img 
              key={index} 
              src={`https://ddragon.leagueoflegends.com/cdn/15.4.1/img/spell/${spell.id}.png`}
              alt={spell.displayName} 
              className="w-6 h-6 rounded-md"
              title={spell.displayName}
            />
          ))}
        </div>
        <div className="flex flex-wrap justify-end w-24">
          {Array.from({ length: 8 }).map((_, slot) => {
            const item = player.items.find((item: any) => item.slot === slot);
            return item ? (
              <img
                key={slot}
                src={`https://ddragon.leagueoflegends.com/cdn/15.4.1/img/item/${item.id}.png`}
                alt={item.displayName}
                className="w-6 h-6 rounded-md m-0.5"
                title={item.displayName}
              />
            ) : (
              <div key={slot} className="w-6 h-6 rounded-md m-0.5 bg-gray-700" />
            );
          })}
        </div>

      </div>
    </div>
  );
};

const TeamColumn: React.FC<{ team: any; isAlly: boolean }> = ({ team, isAlly }) => {
  const teamClass = isAlly ? "border-blue-500" : "border-red-500";
  
  return (
    <div className={`w-full md:w-1/2 border-t-4 ${teamClass} bg-white rounded-md shadow-md`}>
      <div className="p-2 bg-gray-100 flex justify-between items-center">
        <h3 className="font-bold">{isAlly ? "Ally Team" : "Enemy Team"}</h3>
        {/*
        <div className="flex items-center">
          <span className="text-sm font-medium">{team.totalKills}/{team.totalDeaths}/{team.totalAssists}</span>
          {team.win && (
            <Trophy className="w-4 h-4 ml-2 text-yellow-500" />
          )}
        </div>
        */}
      </div>
      {team.players.map((player: any, index: any) => (
        <PlayerRow key={index} player={player} />
      ))}
    </div>
  );
};

const MatchCard: React.FC<{
  match: any;
}> = ({ match }) => {
  const { team, enemyTeam, gameMode, currentTime } = match;
  
  // Format game duration
  const minutes = Math.floor(currentTime / 60);
  const seconds = Math.round(currentTime % 60);
  const formattedDuration = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  
  // Format game creation date
  const gameDate = new Date(match.gameCreation);
  const formattedDate = gameDate.toLocaleDateString();

  const positionOrder: Record<string, number> = {
    TOP: 0,
    JUNGLE: 1,
    MID: 2,
    ADC: 3,
    SUPPORT: 4
  };
  
  return (
    <div className="mb-6">
      <div className="bg-gray-800 text-white p-3 rounded-t-md">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="font-bold">{gameMode}</h2>
            <p className="text-sm text-gray-300">{formattedDate}</p>
          </div>
          <div className="text-right">
            <p className="font-medium">{formattedDuration}</p>
            {/*
            <p className="text-sm text-gray-300">
              {allyTeam.win ? "Victory" : "Defeat"}
            </p>
            */}
          </div>
        </div>
      </div>
      
      <div className="flex flex-col text-black md:flex-row">
        <TeamColumn team={{
          ...team,
          players: [
            match.current,
            ...team.players
          ].sort((a, b) => positionOrder[a.position] - positionOrder[b.position])
        }}  isAlly={true} />
        <TeamColumn team={{
          ...enemyTeam,
          players: [
            ...enemyTeam.players
          ].sort((a, b) => positionOrder[a.position] - positionOrder[b.position])
        }} isAlly={false} />
      </div>
    </div>
  );
};

export default MatchCard;