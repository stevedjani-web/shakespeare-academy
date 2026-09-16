export interface CurrentUserData {
  id: string;
  schoolId: string;
  roleId: string;
  roleCode: string;
  permissions: string[];
  nom: string;
  prenom: string;
  email: string;
}

export interface AccessTokenPayload {
  sub: string;
}
