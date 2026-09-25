export interface CurrentUserData {
  id: string;
  schoolId: string;
  roleId: string;
  roleCode: string;
  permissions: string[];
  nom: string;
  prenom: string;
  email: string;
  /** Langue choisie (« fr » ou « en »), vide tant que l'utilisateur n'a pas choisi. */
  langue: string | null;
}

export interface AccessTokenPayload {
  sub: string;
}
