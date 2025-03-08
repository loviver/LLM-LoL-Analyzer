import fs from 'fs';
import path from 'path';

class DataDragon {
  private static BASE_PATH = path.join(__dirname, '/../../../../data/static');

  public static getTurrets() {
    const items = JSON.parse(fs.readFileSync(path.join(this.BASE_PATH, 'turrets.json'), 'utf8'));
    return items;
  }

  public static getTurretById(keyString: string) {
    const items = DataDragon.getTurrets();
    return items[keyString];
  }
  
  public static getItems() {
    const items = JSON.parse(fs.readFileSync(path.join(this.BASE_PATH, 'items.json'), 'utf8'));
    return items;
  }
  
  public static getChampions() {
    const items = JSON.parse(fs.readFileSync(path.join(this.BASE_PATH, 'champions.json'), 'utf8'));
    return items;
  }
  
  public static getSpells() {
    const items = JSON.parse(fs.readFileSync(path.join(this.BASE_PATH, 'spells.json'), 'utf8'));
    return items;
  }
  
  public static findItemByKey(keyId: string | number) {
    const items = DataDragon.getItems();
    const normalizedKey = String(keyId);
    return items.data[normalizedKey];
  }
  
  public static findSpellByKey(keyId: string | number) {
    const normalizedKey = String(keyId);
    const spell = Object.entries(DataDragon.getSpells().data).find((spell: any) => 
      String(spell[1].key) === normalizedKey
    );
    return spell ? spell[1] : null;
  }
  
  public static findChampionByKey(keyId: string | number) {
    const normalizedKey = String(keyId);
    const champion = Object.entries(DataDragon.getChampions().data).find((champion: any) => 
      String(champion[1].key) === normalizedKey
    );
    return champion ? champion[1] : null;
  }  

  public static findChampionByName(name: string | number) {
    const normalizedName = String(name);
    const champion = Object.entries(DataDragon.getChampions().data).find((champion: any) => 
      String(champion[1].name) === normalizedName
    );
    return champion ? champion[1] : null;
  }  
}

export default DataDragon;
