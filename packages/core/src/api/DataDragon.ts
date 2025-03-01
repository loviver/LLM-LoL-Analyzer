import fs from 'fs';

class DataDragon {

  public static getTurrets() {
    const items = JSON.parse(fs.readFileSync('data/static/turrets.json', 'utf8'));
    return items;
  }

  public static getTurretById(keyString: string) {
    const items = DataDragon.getTurrets();

    return items[keyString];
  }
  
  public static getItems() {
    const items = JSON.parse(fs.readFileSync('data/static//items.json', 'utf8'));
    return items;
  }
  
  public static getChampions() {
    const items = JSON.parse(fs.readFileSync('data/static//champions.json', 'utf8'));
    return items;
  }
  
  public static getSpells() {
    const items = JSON.parse(fs.readFileSync('data/static//spells.json', 'utf8'));
    return items;
  }
  
  public static findItemByKey(keyId: string) {
    const items = DataDragon.getItems();

    return items.data[keyId];
  }
  
  public static findSpellByKey(keyId: string | number) {
    const normalizedKey = String(keyId); // Normalizar a string
    const spell = Object.entries(DataDragon.getSpells().data).find((spell: any) => {
      //cnsole.log(spell);
      return String(spell[1].key) === normalizedKey;
    }); 
    return spell ? spell[1] : null;
  }
  
  public static findChampionByKey(keyId: string | number) {
    const normalizedKey = String(keyId); // Normalizar a string
    const champion = Object.entries(DataDragon.getChampions().data).find((champion: any) => {
      //console.log(champion);
      return String(champion[1].key) === normalizedKey;
    }); 
    return champion ? champion[1] : null;
  }  
}

export default DataDragon;