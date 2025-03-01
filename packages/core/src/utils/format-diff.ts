export const formatDiff = (diffResult: any) => {
  const added: any[] = [];
  const removed: any[] = [];
  const updated: any[] = [];

  if (Array.isArray(diffResult)) {

    
    diffResult.forEach((change) => {
      if (change.type === "ADD") {
        added.push({ key: change.key, change: `+ ${change.value}` });
      } else if (change.type === "REMOVE") {
        removed.push({ key: change.key, change: `- ${change.value}` });
      } else if (change.type === "UPDATE") {

        const changes = Array.isArray(change.changes)
        ? change.changes.map((c: any) => {
          
          if(!c.changes) {

            console.log(c, 'changesn ot exists');

            return null;
          }

          return c.changes.map((cc: any) => {
            
            if(cc.type === "ADD") {
              return `+ ${cc.value}`;
            }
            else if(cc.type === "REMOVE") {
              return `- ${cc.value}`;
            }
            else if(cc.type === "UPDATE") {
              return `${cc.oldValue} -> ${cc.value}`;
            }
            return null;
          })[0];
        })
        : [];

        console.log(changes);

        updated.push({ key: change.key, changes: changes });
      }
    });
  }

  return { added, removed, updated };
};