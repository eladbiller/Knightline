package com.traillink;

import java.io.*;
import java.util.*;

/** Bundled, versioned catalog. No network, accounts, or remote puzzle loading. */
public final class PuzzleCatalog {
    public static final class Entry {
        public final int index, rating;
        public final String id, name, theme, fen, source;
        public final String[] moves;
        Entry(int index, String id, int rating, String fen, String moves, String themes, String source) {
            this.index=index; this.id=id; this.rating=rating; this.fen=fen; this.source=source;
            this.moves=moves.isEmpty()?new String[0]:moves.split(" ");
            theme=themeName(themes); name=index<6?ChessPuzzles.NAMES[index]:theme;
        }
        public String band() { return rating==0?"warmup":rating<1200?"foundation":rating<1600?"intermediate":rating<2000?"challenging":rating<2400?"advanced":"expert"; }
    }
    public final List<Entry> entries;
    public PuzzleCatalog(Reader source) throws IOException {
        ArrayList<Entry> items=new ArrayList<>(); HashSet<String> ids=new HashSet<>();
        for(int i=0;i<6;i++)items.add(new Entry(i,"original-"+i,0,"","",ChessPuzzles.THEMES[i],"Knightline original"));
        BufferedReader input=new BufferedReader(source); String line;
        while((line=input.readLine())!=null){
            if(line.isEmpty())continue;
            String[] f=line.split("\t",-1);
            if(f.length!=6||!f[0].matches("[a-zA-Z0-9]+")||!ids.add(f[0]))throw new IOException("Invalid puzzle catalog");
            Entry entry=new Entry(items.size(),"lichess-"+f[0],Integer.parseInt(f[3]),f[1],f[2],f[4],f[5]);
            if(entry.moves.length<4||entry.moves.length%2!=0)throw new IOException("Incomplete puzzle line");
            items.add(entry);
        }
        entries=Collections.unmodifiableList(items);
    }
    static String themeName(String themes) {
        String[] keys={"defensiveMove","underPromotion","promotion","sacrifice","deflection","attraction","discoveredAttack","pin","skewer","fork","mateIn3","mateIn2","endgame"};
        String[] names={"Find the defense","Underpromotion","Promotion race","The sacrifice","Deflection","Attraction","Discovered attack","The pin","The skewer","Double attack","Mate in three","Mate in two","Endgame technique"};
        List<String> tags=Arrays.asList(themes.split(" "));
        for(int i=0;i<keys.length;i++)if(tags.contains(keys[i]))return names[i];
        return themes.contains(" ")&&Character.isUpperCase(themes.charAt(0))?themes:"Calculate the line";
    }
}
