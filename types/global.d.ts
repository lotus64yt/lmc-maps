declare module '@babel/traverse' {
  const traverse: any;
  export default traverse;
}

declare module 'geojson' {
  export interface GeoJSON {
    type: string;
  }
  
  export interface Point extends GeoJSON {
    type: 'Point';
    coordinates: [number, number];
  }
  
  export interface LineString extends GeoJSON {
    type: 'LineString';
    coordinates: [number, number][];
  }
  
  export interface Polygon extends GeoJSON {
    type: 'Polygon';
    coordinates: [number, number][][];
  }
  
  export interface Feature<T = any> extends GeoJSON {
    type: 'Feature';
    properties: any;
    geometry: T;
  }
  
  export interface FeatureCollection<T = any> extends GeoJSON {
    type: 'FeatureCollection';
    features: Feature<T>[];
  }
}

declare module 'prop-types' {
  export const string: any;
  export const number: any;
  export const bool: any;
  export const object: any;
  export const array: any;
  export const func: any;
  export const node: any;
  export const element: any;
  export const instanceOf: any;
  export const oneOf: any;
  export const oneOfType: any;
  export const arrayOf: any;
  export const objectOf: any;
  export const shape: any;
  export const exact: any;
}
