/**
 * Formate une durée en minutes vers un format lisible
 * @param minutes - Durée en minutes
 * @returns String formatée (ex: "2s 3j 2h 30min", "1j 2h 30min", "45min", "2h 15min")
 */
export function formatDuration(minutes: number): string {
  if (minutes < 1) {
    return "< 1min";
  }
  
  if (minutes < 60) {
    return `${Math.round(minutes)}min`;
  }
  
  const totalHours = minutes / 60;
  
  if (totalHours < 24) {
    const hours = Math.floor(totalHours);
    const remainingMinutes = Math.round(minutes % 60);
    
    if (remainingMinutes === 0) {
      return `${hours}h`;
    }
    return `${hours}h ${remainingMinutes}min`;
  }
  
  const totalDays = totalHours / 24;
  
  if (totalDays < 7) {
    const days = Math.floor(totalDays);
    const remainingHours = Math.floor(totalHours % 24);
    const remainingMinutes = Math.round(minutes % 60);
    
    let result = `${days}j`;
    
    if (remainingHours > 0) {
      result += ` ${remainingHours}h`;
    }
    
    if (remainingMinutes > 0) {
      result += ` ${remainingMinutes}min`;
    }
    
    return result;
  }
  
  // Gestion des semaines
  const weeks = Math.floor(totalDays / 7);
  const remainingDays = Math.floor(totalDays % 7);
  const remainingHours = Math.floor(totalHours % 24);
  const remainingMinutes = Math.round(minutes % 60);
  
  let result = `${weeks}s`;
  
  if (remainingDays > 0) {
    result += ` ${remainingDays}j`;
  }
  
  if (remainingHours > 0) {
    result += ` ${remainingHours}h`;
  }
  
  if (remainingMinutes > 0) {
    result += ` ${remainingMinutes}min`;
  }
  
  return result;
}

/**
 * Parse une durée textuelle vers des minutes
 * @param durationText - Texte de durée (ex: "2s 3j", "1j 2h 30min", "45min")
 * @returns Nombre de minutes
 */
export function parseDurationToMinutes(durationText: string): number {
  if (durationText.includes("< 1min")) {
    return 0.5;
  }
  
  let totalMinutes = 0;
  
  // Extraction des semaines
  const weekMatch = durationText.match(/(\d+)s/);
  if (weekMatch) {
    totalMinutes += parseInt(weekMatch[1]) * 7 * 24 * 60;
  }
  
  // Extraction des jours
  const dayMatch = durationText.match(/(\d+)j/);
  if (dayMatch) {
    totalMinutes += parseInt(dayMatch[1]) * 24 * 60;
  }
  
  // Extraction des heures
  const hourMatch = durationText.match(/(\d+)h/);
  if (hourMatch) {
    totalMinutes += parseInt(hourMatch[1]) * 60;
  }
  
  // Extraction des minutes
  const minMatch = durationText.match(/(\d+)min/);
  if (minMatch) {
    totalMinutes += parseInt(minMatch[1]);
  }
  
  return totalMinutes;
}

/**
 * Formate une distance en mètres vers un format lisible
 * @param meters - Distance en mètres
 * @returns String formatée (ex: "1.2km", "500m")
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  
  const kilometers = meters / 1000;
  if (kilometers < 10) {
    return `${kilometers.toFixed(1)}km`;
  }
  
  return `${Math.round(kilometers)}km`;
}

/**
 * Formate une durée en secondes vers un format lisible pour la navigation
 * @param seconds - Durée en secondes
 * @returns String formatée (ex: "2h 30min", "45min", "2min")
 */
export function formatDurationFromSeconds(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }
  
  const minutes = Math.floor(seconds / 60);
  
  if (minutes < 60) {
    return `${minutes}min`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  if (remainingMinutes === 0) {
    return `${hours}h`;
  }
  
  return `${hours}h ${remainingMinutes}min`;
}
