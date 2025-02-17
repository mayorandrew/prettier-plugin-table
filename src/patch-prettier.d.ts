declare module 'prettier/plugins/estree' {
  import { Printer } from 'prettier';
  export const printers: {
    estree: Printer;
  };
} 
