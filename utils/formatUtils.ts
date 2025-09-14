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

export function parseDurationToMinutes(durationText: string): number {
  if (durationText.includes("< 1min")) {
    return 0.5;
  }
  
  let totalMinutes = 0;
  
  const weekMatch = durationText.match(/(\d+)s/);
  if (weekMatch) {
    totalMinutes += parseInt(weekMatch[1]) * 7 * 24 * 60;
  }
  
  const dayMatch = durationText.match(/(\d+)j/);
  if (dayMatch) {
    totalMinutes += parseInt(dayMatch[1]) * 24 * 60;
  }
  
  const hourMatch = durationText.match(/(\d+)h/);
  if (hourMatch) {
    totalMinutes += parseInt(hourMatch[1]) * 60;
  }
  
  const minMatch = durationText.match(/(\d+)min/);
  if (minMatch) {
    totalMinutes += parseInt(minMatch[1]);
  }
  
  return totalMinutes;
}

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
