/**
 * A catalogue with the same keys as the German one, every leaf a string. The English
 * catalogue is typed with it, so a missing or extra key fails the typecheck (story 16.3).
 */
export type Messages<T> = {
  [K in keyof T]: T[K] extends string ? string : Messages<T[K]>;
};
