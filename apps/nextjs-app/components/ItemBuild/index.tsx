import React from 'react';
import styles from './index.module.css';

interface ItemImage {
  full: string;
  sprite: string;
  group: string;
  x: number;
  y: number;
  w: number;
  h: 48;
}

interface ItemGold {
  base: number;
  purchasable: boolean;
  total: number;
  sell: number;
}

interface ItemStats {
  FlatHPPoolMod?: number;
  FlatPhysicalDamageMod?: number;
}

interface Item {
  name: string;
  description: string;
  image: ItemImage;
  gold: ItemGold;
  stats: ItemStats;
  urlImage: string;
}

interface BuildItem {
  itemIds: Item[];
  winrate: number;
  pickrate: number;
}

interface ItemBuildProps {
  builds: BuildItem[];
}

const ItemTooltip: React.FC<{ item: Item }> = ({ item }) => {
  const cleanDescription = (description: string) => {
    return description
      .replace(/<mainText>(.*?)<\/mainText>/g, '<span class="text-green-500 font-bold">$1</span>')
      .replace(/<stats>(.*?)<\/stats>/g, '<span class="text-blue-500">$1</span>')
      .replace(/<attention>(.*?)<\/attention>/g, '<span class="text-orange-500 italic">$1</span>')
      .replace(/<passive>(.*?)<\/passive>/g, '<span class="text-purple-500">$1</span>')
      .replace(/<shield>(.*?)<\/shield>/g, '<span class="text-teal-500">$1</span>')
      .replace(/<physicalDamage>(.*?)<\/physicalDamage>/g, '<span class="text-red-500">$1</span>')
      .replace(/<speed>(.*?)<\/speed>/g, '<span class="text-yellow-500">$1</span>')
      .replace(/<scaleAD>(.*?)<\/scaleAD>/g, '<span class="text-lime-500">$1</span>')
      .replace(/<scaleArmor>(.*?)<\/scaleArmor>/g, '<span class="text-slate-500">$1</span>');
  };

  return (
    <div className={styles["item-tooltip"]}>
      <div className={styles["tooltip-header"]}>
        <div className={styles["tooltip-title"]}>{item.name}</div>
      </div>
      <div className={styles["tooltip-stats"]}>
        <div
          className="text-sm text-gray-800 mb-2"
          dangerouslySetInnerHTML={{ __html: cleanDescription(item.description) }}
        />
      </div>
      <div className={styles["tooltip-gold"]}>
        <span>Cost:</span>
        <span>{item.gold.total} gold</span>
      </div>
      <div className={styles["arrow"]} />
    </div>
  );
};

const ItemBuild: React.FC<ItemBuildProps> = ({ builds }) => {
  return (
    <div className={styles["builds-container"]}>
      {builds.map((build, buildIndex) => (
        <div key={buildIndex} className="build-row">
          <div className={styles["build-stats"]}>
            <div className={styles["stat"]}>
              Win: {build.winrate.toFixed(1)}%
            </div>
            <div className={styles["stat"]}>
              Pick: {(build.pickrate * 100).toFixed(1)}%
            </div>
          </div>
          <div className={styles["items-row"]}>
            {build.itemIds.map((item, itemIndex) => (
              <div key={itemIndex} className={styles["item-container"]}>
                <img
                  src={`https://ddragon.leagueoflegends.com/cdn/14.4.1/img/item/${item.image.full}`}
                  alt={item.name}
                  className={styles["item-image"]}
                />
                <ItemTooltip item={item} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default ItemBuild;