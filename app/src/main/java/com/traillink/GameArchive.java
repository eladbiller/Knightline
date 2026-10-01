package com.traillink;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;

/** Review-only copies, deliberately independent from the resumable match.bin. */
public final class GameArchive {
    public static final int LIMIT = 100;
    private final File directory;
    private final Map<String, Entry> entries = new HashMap<>();

    public static final class Entry implements Serializable {
        private static final long serialVersionUID = 1L;
        public final String id, white, black, mode;
        public final long startedAt;
        public final int orientation, mySide;
        public final Game game;
        public Entry(String id, String white, String black, String mode, long startedAt,
                     int orientation, int mySide, Game game) {
            this.id=id; this.white=white; this.black=black; this.mode=mode; this.startedAt=startedAt;
            this.orientation=orientation; this.mySide=mySide; this.game=game.copy();
            this.game.history=copyArrays(game.history); this.game.chessStates=copyArrays(game.chessStates);
            this.game.chessMoves=copyArrays(game.chessMoves); this.game.analysisBest=copyArrays(game.analysisBest);
        }
        public Entry copy() { return new Entry(id,white,black,mode,startedAt,orientation,mySide,game); }
        public String result() { return game.winner == 0 ? "1–0" : game.winner == 1 ? "0–1" : game.winner == 2 ? "½–½" : "Unfinished"; }
        private static ArrayList<int[]> copyArrays(List<int[]> input) {
            ArrayList<int[]> result=new ArrayList<>();for(int[] value:input)result.add(value.clone());return result;
        }
    }

    public GameArchive(File directory) throws IOException {
        this.directory=directory;
        Files.createDirectories(directory.toPath());
        File[] files=directory.listFiles((dir,name)->name.matches("[a-f0-9-]{36}\\.game"));
        if(files!=null) for(File file:files) {
            // An interrupted/corrupt entry must not hide the rest of the library.
            if(file.length()>8*1024*1024) continue;
            try(ObjectInputStream input=new ObjectInputStream(new FileInputStream(file))) {
                if(input.readInt()!=1) continue;
                Entry entry=(Entry)input.readObject();
                // Old versions archived teaching positions. Keep those files
                // untouched, but exclude them before the match-retention limit.
                if(valid(entry)&&!isLessonMode(entry.mode)&&file.getName().equals(fileName(entry.id))) entries.put(entry.id,entry);
            } catch(IOException|ClassNotFoundException|RuntimeException ignored) { }
        }
        prune();
    }
    private static boolean valid(Entry e) {
        return e!=null&&e.id!=null&&!e.id.isEmpty()&&e.id.length()<160&&e.game!=null&&e.game.id==0
                &&e.game.history.size()==e.game.chessMoves.size()+1&&!e.game.chessMoves.isEmpty()
                &&e.white!=null&&e.black!=null&&e.mode!=null&&e.orientation>=0&&e.orientation<=1;
    }
    private static String fileName(String id) {
        return UUID.nameUUIDFromBytes(id.getBytes(StandardCharsets.UTF_8))+".game";
    }
    public static boolean isLessonMode(String mode) {
        return mode != null && (mode.trim().equalsIgnoreCase("Guided lesson")
                || mode.trim().equalsIgnoreCase("Endgame practice"));
    }
    public synchronized Entry get(String id) { Entry e=entries.get(id); return e==null?null:e.copy(); }
    public synchronized List<Entry> list() {
        List<Entry> result=new ArrayList<>();
        for(Entry e:entries.values()) result.add(e.copy());
        result.sort(Comparator.comparingLong((Entry e)->e.startedAt).reversed().thenComparing(e->e.id));
        return result;
    }
    public static final class Summary {
        public final String id,white,black,mode,result;
        public final long startedAt;
        public final int plies;
        public final boolean finished;
        private Summary(Entry e){id=e.id;white=e.white;black=e.black;mode=e.mode;result=e.result();startedAt=e.startedAt;plies=e.game.chessMoves.size();finished=e.game.winner>=0;}
    }
    public synchronized List<Summary> summaries() {
        List<Summary> result=new ArrayList<>();for(Entry e:entries.values())result.add(new Summary(e));
        result.sort(Comparator.comparingLong((Summary e)->e.startedAt).reversed().thenComparing(e->e.id));return result;
    }
    public synchronized void put(Entry candidate) throws IOException {
        if(!valid(candidate)) throw new IllegalArgumentException("Not a reviewable chess game");
        if(isLessonMode(candidate.mode)) return;
        Entry old=entries.get(candidate.id);
        Entry entry=old==null?candidate.copy():new Entry(candidate.id,candidate.white,candidate.black,candidate.mode,
                old.startedAt,candidate.orientation,candidate.mySide,candidate.game);
        if(old!=null&&Arrays.equals(encode(old),encode(entry))) return;
        byte[] data=encode(entry);
        File target=new File(directory,fileName(entry.id)), temporary=new File(directory,fileName(entry.id)+".tmp");
        try(FileOutputStream output=new FileOutputStream(temporary)) { output.write(data); output.getFD().sync(); }
        try { Files.move(temporary.toPath(),target.toPath(),StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING); }
        catch(AtomicMoveNotSupportedException error) { Files.move(temporary.toPath(),target.toPath(),StandardCopyOption.REPLACE_EXISTING); }
        entries.put(entry.id,entry);
        prune();
    }
    private static byte[] encode(Entry entry) throws IOException {
        ByteArrayOutputStream bytes=new ByteArrayOutputStream();
        try(ObjectOutputStream output=new ObjectOutputStream(bytes)) { output.writeInt(1); output.writeObject(entry); }
        return bytes.toByteArray();
    }
    private void prune() throws IOException {
        List<Entry> ordered=new ArrayList<>(entries.values());
        ordered.sort(Comparator.comparingLong((Entry e)->e.startedAt).reversed().thenComparing(e->e.id));
        for(int i=LIMIT;i<ordered.size();i++) {
            Entry e=ordered.get(i);
            // Only files with our exact generated name inside this private directory.
            Files.deleteIfExists(new File(directory,fileName(e.id)).toPath());
            entries.remove(e.id);
        }
    }
}
