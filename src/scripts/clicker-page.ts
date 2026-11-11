// Spacebar Clicker's page, below the game: the perk list's filter chips
// (SPACEBAR-CLICKER.md §8.5.20). One family and one rarity at a time; a chip
// pressed again lets go. Without this script the chips stay hidden and every
// perk shows.

const filter = document.getElementById('sc-perk-filter');
const none = document.getElementById('sc-perk-none');

if (filter && none) {
  const families = [...document.querySelectorAll<HTMLElement>('#perks .sc-family')];
  const familyChips = [...filter.querySelectorAll<HTMLButtonElement>('[data-filter-family]')];
  const rarityChips = [...filter.querySelectorAll<HTMLButtonElement>('[data-filter-rarity]')];
  let family = '';
  let rarity = '';

  const apply = (): void => {
    let shown = 0;
    for (const section of families) {
      const inFamily = !family || section.dataset.family === family;
      let here = 0;
      for (const card of section.querySelectorAll<HTMLElement>('.sc-perk')) {
        const show = inFamily && (!rarity || card.dataset.rarity === rarity);
        card.hidden = !show;
        if (show) here += 1;
      }
      section.hidden = here === 0;
      shown += here;
    }
    none.hidden = shown > 0;
    for (const chip of familyChips) {
      chip.setAttribute('aria-pressed', String(chip.dataset.filterFamily === family));
    }
    for (const chip of rarityChips) {
      chip.setAttribute('aria-pressed', String(chip.dataset.filterRarity === rarity));
    }
  };

  filter.addEventListener('click', (event) => {
    const chip = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!chip) return;
    if (chip.dataset.filterFamily !== undefined) {
      family = chip.dataset.filterFamily === family ? '' : chip.dataset.filterFamily;
    } else if (chip.dataset.filterRarity !== undefined) {
      rarity = chip.dataset.filterRarity === rarity ? '' : chip.dataset.filterRarity;
    }
    apply();
  });

  filter.hidden = false;
}
