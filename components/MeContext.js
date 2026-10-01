import { createContext, useContext } from 'react';

// המשתמש המחובר + ההרשאות שלו (מ-/api/me). Layout מספק אותו; כל רכיב בתוכו קורא עם useMe().
export const MeContext = createContext(null);

export function useMe() {
  return useContext(MeContext);
}

export function can(me, permissionKey) {
  return !!me && (me.role === 'admin' || me.permissions.includes(permissionKey));
}

// מציג את children רק אם למשתמש יש את ההרשאה (לכפתורים כמו "טעינת קבצים" / "שליחת מייל")
export function IfCan({ permission, children }) {
  return can(useMe(), permission) ? children : null;
}
