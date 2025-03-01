// Función que transforma un array de ítems en un objeto indexado por slot
const keyBySlot = (items: any[]): Record<string, any> =>
  items.reduce((acc, item) => {
    acc[item.slot] = item.displayName;
    return acc;
  }, {});

// Función para comparar dos arrays de ítems según el slot
export const diffBySlot = (
  oldItems: any[],
  newItems: any[]
): { added: any[]; removed: any[]; updated: any[] } => {
  const oldMap = keyBySlot(oldItems);
  const newMap = keyBySlot(newItems);

  const added: any[] = [];
  const removed: any[] = [];
  const updated: any[] = [];

  // Revisamos los slots nuevos
  Object.keys(newMap).forEach((slot) => {
    if(slot === '6') return;

    if (!oldMap.hasOwnProperty(slot)) {
      // Slot nuevo (agregado)
      added.push({ slot, displayName: newMap[slot] });
    } else if (oldMap[slot] !== newMap[slot]) {
      // Slot existente pero displayName ha cambiado (actualizado)
      updated.push({
        slot,
        oldValue: oldMap[slot],
        newValue: newMap[slot],
      });
    }
  });

  // Revisamos los slots que desaparecieron
  Object.keys(oldMap).forEach((slot) => {
    if(slot === '6') return;
    
    if (!newMap.hasOwnProperty(slot)) {
      removed.push({ slot, displayName: oldMap[slot] });
    }
  });

  return { added, removed, updated };
};

export const getTeamDiff = (oldTeam: any[], newTeam: any[]): any[] => {
  return oldTeam.map(oldPlayer => {
    // Se busca el jugador en el nuevo equipo por su nombre (championName)
    const newPlayer = newTeam.find(p => p.player === oldPlayer.player);
    if (newPlayer) {
      const diff = diffBySlot(oldPlayer.items, newPlayer.items);
      return { player: oldPlayer.player, diff };
    } else {
      // Si no se encuentra el jugador, se consideran todos sus ítems como removidos
      return { player: oldPlayer.player, diff: { added: [], removed: oldPlayer.items, updated: [] } };
    }
  });
};
