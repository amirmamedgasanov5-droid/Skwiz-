import firebase from "firebase/compat/app";
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged, 
  updateProfile,
  User
} from "firebase/auth";
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  arrayUnion, 
  arrayRemove,
  serverTimestamp,
  documentId
} from "firebase/firestore";
import "firebase/compat/storage";
import { firebaseConfig } from "../firebaseConfig";
import { UserProfile, Post } from "../types";

// Initialize Firebase (Compat with Modular fallback)
const app = firebase.initializeApp(firebaseConfig);
export const auth = getAuth(app as any);
export const db = getFirestore(app as any);
export const storage = firebase.storage();

// --- Auth Helpers ---

export const mapAuthCodeToMessage = (code: string) => {
  console.error("Auth Error Code:", code); // Log exact error to console
  switch (code) {
    case 'auth/email-already-in-use': return 'Этот Handle уже занят.';
    case 'auth/invalid-email': return 'Некорректный формат Handle.';
    case 'auth/user-not-found': return 'Пользователь не найден.';
    case 'auth/wrong-password': return 'Неверный пароль.';
    case 'auth/invalid-credential': return 'Неверное имя пользователя или пароль.';
    case 'auth/network-request-failed': return 'Ошибка сети. Проверьте подключение.';
    case 'auth/operation-not-allowed': return 'Вход по Email отключен в Firebase Console.';
    case 'auth/too-many-requests': return 'Слишком много попыток. Подождите.';
    default: return `Ошибка авторизации: ${code}`;
  }
};

export const checkHandleAvailability = async (handle: string): Promise<boolean> => {
  const q = query(collection(db, "users"), where("handle", "==", handle));
  const querySnapshot = await getDocs(q);
  return querySnapshot.empty;
};

// --- Architect Logic ---
export const isArchitect = (handle: string) => handle === '@amir';

// --- User Management ---

export const createUserDocument = async (uid: string, data: Omit<UserProfile, 'uid'>) => {
  // If Architect, force admin/verified
  if (data.handle === '@amir') {
    data.isVerified = true;
    data.isAdmin = true;
  }
  
  await setDoc(doc(db, "users", uid), {
    uid,
    ...data,
    following: [],
    savedPosts: [],
    createdAt: Date.now()
  });
};

export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  const docRef = doc(db, "users", uid);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return docSnap.data() as UserProfile;
  }
  return null;
};

export const requestVerification = async (uid: string, handle: string) => {
  await addDoc(collection(db, "verification_requests"), {
    uid,
    handle,
    status: 'pending',
    createdAt: Date.now()
  });
};

// --- Storage & Compression ---

export const compressImage = (file: File): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const maxWidth = 1920;
    const maxHeight = 1080;
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Compression failed"));
        }, 'image/jpeg', 0.7); // 70% quality JPEG
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

export const uploadFile = async (file: File | Blob, path: string): Promise<string> => {
  const storageRef = storage.ref(path);
  await storageRef.put(file);
  return await storageRef.getDownloadURL();
};

// --- Feeds & Posts ---

export const createPost = async (postData: any) => {
  await addDoc(collection(db, "posts"), {
    ...postData,
    likes: [],
    commentsCount: 0,
    createdAt: Date.now()
  });
};

export const toggleLike = async (postId: string, uid: string, isLiked: boolean) => {
  const postRef = doc(db, "posts", postId);
  if (isLiked) {
    await updateDoc(postRef, {
      likes: arrayRemove(uid)
    });
  } else {
    await updateDoc(postRef, {
      likes: arrayUnion(uid)
    });
  }
};

export const subscribeToFeed = (callback: (posts: any[]) => void) => {
  const q = query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(50));
  return onSnapshot(q, (snapshot) => {
    const posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(posts);
  });
};

// --- Saved Posts ---

export const toggleSavePost = async (postId: string, uid: string, isSaved: boolean) => {
  const userRef = doc(db, "users", uid);
  if (isSaved) {
    await updateDoc(userRef, {
      savedPosts: arrayRemove(postId)
    });
  } else {
    await updateDoc(userRef, {
      savedPosts: arrayUnion(postId)
    });
  }
};

export const getSavedPosts = async (postIds: string[]): Promise<Post[]> => {
  if (!postIds || postIds.length === 0) return [];
  
  // Firestore "in" query supports max 10 items. We need to batch or just get docs individually.
  // For simplicity in this demo, let's fetch individually (optimization: use batches in real prod).
  const posts: Post[] = [];
  // Limiting to last 20 for performance
  const recentIds = postIds.slice(-20).reverse(); 

  for (const id of recentIds) {
    const pDoc = await getDoc(doc(db, "posts", id));
    if (pDoc.exists()) {
      posts.push({ id: pDoc.id, ...pDoc.data() } as Post);
    }
  }
  return posts;
};


// --- Search ---

export const searchUsers = async (term: string): Promise<UserProfile[]> => {
  if (!term) return [];
  const strSearch = term.toLowerCase();
  const strEnd = strSearch + '\uf8ff';
  
  // Note: This requires a composite index or simple query. 
  // Since we store handle as written, we might need to store a lowercase version for case-insensitive search.
  // For now, we assume user types loosely.
  
  // Important: Firestore doesn't do "contains". It does "startsWith" well.
  // Ensure your 'handle' in DB is searchable. 
  
  const q = query(
    collection(db, "users"), 
    where("handle", ">=", term),
    where("handle", "<=", term + '\uf8ff'),
    limit(10)
  );
  
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as UserProfile);
};

// --- Groups ---

export const createGroup = async (groupData: any) => {
  await addDoc(collection(db, "groups"), {
    ...groupData,
    createdAt: Date.now()
  });
};

export const subscribeToGroups = (callback: (groups: any[]) => void) => {
  const q = query(collection(db, "groups"), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snapshot) => {
    const groups = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(groups);
  });
};

export const sendGroupMessage = async (groupId: string, messageData: any) => {
  await addDoc(collection(db, "groups", groupId, "messages"), {
    ...messageData,
    createdAt: Date.now()
  });
};

export const subscribeToGroupMessages = (groupId: string, callback: (msgs: any[]) => void) => {
  const q = query(collection(db, "groups", groupId, "messages"), orderBy("createdAt", "asc"), limit(100));
  return onSnapshot(q, (snapshot) => {
    const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(msgs);
  });
};

// --- Admin ---
export const subscribeToVerificationRequests = (callback: (reqs: any[]) => void) => {
  const q = query(collection(db, "verification_requests"), where("status", "==", "pending"));
  return onSnapshot(q, (snapshot) => {
    const reqs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(reqs);
  });
};

export const approveVerification = async (reqId: string, uid: string) => {
  // Update request status
  await updateDoc(doc(db, "verification_requests", reqId), { status: 'approved' });
  // Update user profile
  await updateDoc(doc(db, "users", uid), { isVerified: true });
};