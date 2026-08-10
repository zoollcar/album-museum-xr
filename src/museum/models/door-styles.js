export const DOOR_STYLES = {
  'classic-oak': {
    kind: 'hinged',
    frame: 'src: url(/museum-assets/white-oak-floor.jpg); color: #735037; repeat: 1 2; roughness: .76; metalness: .04',
    leaf: 'src: url(/museum-assets/white-oak-floor.jpg); color: #71472f; repeat: 1 2; roughness: .74; metalness: .03',
    inset: '#5d3e2d',
    hardware: '#282522'
  },
  'sage-panel': {
    kind: 'hinged',
    frame: 'color: #536558; roughness: .78; metalness: .02',
    leaf: 'color: #718374; roughness: .82; metalness: .01',
    inset: '#5d7162',
    hardware: '#9a7c4d'
  },
  'deco-walnut': {
    kind: 'hinged',
    frame: 'src: url(/museum-assets/floor-herringbone-smoked-oak.webp); color: #44352f; repeat: 1 2; roughness: .68; metalness: .04',
    leaf: 'src: url(/museum-assets/floor-herringbone-smoked-oak.webp); color: #574038; repeat: 1 2; roughness: .66; metalness: .04',
    inset: '#302a32',
    hardware: '#b18a50'
  },
  'modern-ash': {
    kind: 'hinged',
    frame: 'src: url(/museum-assets/white-oak-floor.jpg); color: #b9aa9c; repeat: 1 2; roughness: .8; metalness: .02',
    leaf: 'src: url(/museum-assets/white-oak-floor.jpg); color: #c8b9aa; repeat: 1 2; roughness: .82; metalness: .01',
    inset: '#a99b8f',
    hardware: '#3e4142'
  },
  'elevator-brushed': {
    kind: 'sliding',
    frame: 'color: #5c6164; metalness: .78; roughness: .25',
    leaf: 'color: #aeb3b5; metalness: .7; roughness: .3',
    seam: '#4d5254',
    accent: '#d7b779'
  },
  'elevator-bronze': {
    kind: 'sliding',
    frame: 'src: url(/museum-assets/material-bronze-patina.webp); color: #6f5842; repeat: 1 2; metalness: .58; roughness: .4',
    leaf: 'src: url(/museum-assets/material-bronze-patina.webp); color: #9a7954; repeat: 1 2; metalness: .5; roughness: .44',
    seam: '#463a30',
    accent: '#d6b574'
  },
  'elevator-dark': {
    kind: 'sliding',
    frame: 'color: #292d30; metalness: .72; roughness: .3',
    leaf: 'color: #51575b; metalness: .64; roughness: .34',
    seam: '#171a1c',
    accent: '#e0c38a'
  }
};

const THEME_DOORS = {
  classic: { hinged: 'classic-oak', sliding: 'elevator-brushed' },
  botanical: { hinged: 'sage-panel', sliding: 'elevator-bronze' },
  'art-deco': { hinged: 'deco-walnut', sliding: 'elevator-bronze' },
  terrazzo: { hinged: 'modern-ash', sliding: 'elevator-dark' }
};

export const HINGED_DOOR_STYLE_IDS = Object.keys(DOOR_STYLES).filter((id) => DOOR_STYLES[id].kind === 'hinged');
export const ELEVATOR_DOOR_STYLE_IDS = Object.keys(DOOR_STYLES).filter((id) => DOOR_STYLES[id].kind === 'sliding');

export function resolveDoorStyle(room, connectionKind = 'direct', requestedStyle = null) {
  const kind = connectionKind === 'elevator' ? 'sliding' : 'hinged';
  const requested = requestedStyle || (kind === 'sliding' ? room?.elevatorDoorStyle : room?.doorStyle);
  const fallback = THEME_DOORS[room?.theme || 'classic']?.[kind] || THEME_DOORS.classic[kind];
  const id = DOOR_STYLES[requested]?.kind === kind ? requested : fallback;
  return { id, ...DOOR_STYLES[id] };
}
