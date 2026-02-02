export type Role = 'Student' | 'Sheikh Aspirant';

export interface UserProfile {
  uid: string;
  handle: string; // @handle
  role: Role;
  photoURL: string | null;
  createdAt: number;
  isVerified: boolean;
  isAdmin: boolean;
  following: string[];
  savedPosts: string[]; // Array of Post IDs
}

export interface Post {
  id: string;
  authorUid: string;
  authorHandle: string;
  authorPhotoURL: string | null;
  content: string;
  mediaURL?: string;
  mediaType?: 'image' | 'video';
  createdAt: number;
  likes: string[]; // Array of UIDs
  commentsCount: number;
}

export interface Comment {
  id: string;
  postId: string;
  authorUid: string;
  authorHandle: string;
  authorPhotoURL: string | null;
  text: string;
  createdAt: number;
}

export interface Group {
  id: string;
  name: string;
  description: string;
  photoURL: string | null;
  createdBy: string;
  createdAt: number;
  members: string[];
}

export interface ChatMessage {
  id: string;
  groupId: string;
  senderUid: string;
  senderHandle: string;
  senderPhotoURL: string | null;
  text: string;
  createdAt: number;
}

export interface VerificationRequest {
  id: string;
  uid: string;
  handle: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
}