package com.traillink;

public final class NavigationTest {
    private static int checks;
    private static void equal(String expected, String actual) {
        checks++; if (!expected.equals(actual)) throw new AssertionError(expected+" != "+actual);
    }
    public static void main(String[] args) {
        AppNavigation n=new AppNavigation();
        equal("exit",n.back("home"));
        for(String tab:new String[]{"play","history","profile","learn"})equal("home",n.back(tab));
        equal("learn",n.back("puzzle"));
        for(String tab:new String[]{"home","play","history"}) {
            n.enterGame(tab,false);equal(tab,n.back("game"));
            n.enterReview(false,true);equal("game",n.back("review"));
            n.enterGame("game",false);equal(tab,n.back("game"));
            n.enterReview(true,true);equal("history",n.back("review"));
            n.enterReview(true,false);equal("history",n.back("review"));
            n.enterReview(false,false);equal("home",n.back("review"));
        }
        n.enterGame("home",true);equal("learn",n.back("game"));
        n.enterReview(false,true);equal("game",n.back("review"));
        equal("learn",n.back("game"));
        n.enterReview(false,false);equal("home",n.back("review"));
        System.out.println("NavigationTest: "+checks+" assertions passed");
    }
}
